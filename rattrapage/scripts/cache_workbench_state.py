#!/usr/bin/env python3
"""
Cache the artifacts needed by the workbench UI:
  - workbench_state.json  : y_prob, y_test, indexes, default params, predictions
  - workbench_alerts.json : per-alert metadata (rule_id, level, snippet, ...) for the alert explorer
  - workbench_pool.json   : pool indexes + their probabilities (for AL lab)

Backend endpoints read these so the UI can be snappy without retraining.
"""
from __future__ import annotations

import csv
import json
import os
import sys

import numpy as np

THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(THIS, "..", "..")))
sys.path.insert(0, THIS)
from alertoptimizer import (  # noqa: E402
    RandomForest, assign_test_clusters, enrich_clusters,
    metrics, roc_auc, find_threshold,
)
from fast_helpers import chunked_dbscan, stratified_subsample, patch_random_forest  # noqa: E402
from full_experiment_real import load_real_v2, stratified_split  # noqa: E402

patch_random_forest()

ROOT = os.path.join(THIS, "..")
RESULTS = os.path.join(ROOT, "results")
UI_DATA = os.path.join(ROOT, "ui", "frontend", "public", "data")

SEED = 42
DBSCAN_MAX_LABELED = 1500
EPS = 0.25
MIN_PTS = 3
N_TREES = 50
MAX_DEPTH = 14


def main():
    print("Loading dataset…", flush=True)
    X, y, raw, meta = load_real_v2(add_context_feature=True)
    n_rules = len(meta["rule_ids"])

    print(f"  {len(y)} alerts · {n_rules} rules · FP {np.mean(y):.1%}", flush=True)

    lab_idx, pool_idx, te_idx = stratified_split(y, seed=SEED)
    X_lab, y_lab = X[lab_idx], y[lab_idx]
    X_te, y_te = X[te_idx], y[te_idx]
    X_pool, y_pool = X[pool_idx], y[pool_idx]

    print(f"Split: {len(lab_idx)} lab / {len(pool_idx)} pool / {len(te_idx)} test", flush=True)

    db_sub_idx = stratified_subsample(np.arange(len(lab_idx)), y_lab, DBSCAN_MAX_LABELED, seed=SEED)
    X_db = X_lab[db_sub_idx][:, [0, 1, 2, 3]]
    y_db = y_lab[db_sub_idx]
    print(f"DBSCAN on {len(db_sub_idx)} sub-sampled labeled points…", flush=True)
    cl_db = chunked_dbscan(X_db, eps=EPS, min_pts=MIN_PTS)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
    cl_lab, _ = assign_test_clusters(X_lab[:, [0, 1, 2, 3]], X_db, cl_db, EPS)
    cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, EPS)
    cl_pool, _ = assign_test_clusters(X_pool[:, [0, 1, 2, 3]], X_db, cl_db, EPS)
    _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
    X_lab_full, _ = enrich_clusters(X_lab, cl_lab, y_lab, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_pool_full, _ = enrich_clusters(X_pool, cl_pool, y_pool, n_cl, is_train=False, cl_fp_map=cl_fp_map)

    print("Training RF (default v6 params)…", flush=True)
    rf = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=SEED)
    rf.fit(X_lab_full, y_lab)
    y_prob_te = rf.predict_proba(X_te_full)
    y_prob_pool = rf.predict_proba(X_pool_full)

    # Default operating point (F1-optimal under constraints)
    best_t = find_threshold(y_te, y_prob_te, "f1", min_recall=0.85, min_red=0.50)
    m = metrics(y_te, y_prob_te, best_t)

    # ──────────── workbench_state.json ────────────
    # Predictions + truth for threshold tuner (round to 4 digits to keep JSON small)
    state = {
        "seed": SEED,
        "n_rules": n_rules,
        "default": {
            "eps": EPS, "min_pts": MIN_PTS,
            "n_estimators": N_TREES, "max_depth": MAX_DEPTH,
            "threshold": best_t,
            "metrics": m,
            "roc_auc": roc_auc(y_te, y_prob_te),
        },
        "test": {
            "n": int(len(y_te)),
            "y_true": [int(v) for v in y_te.tolist()],
            "y_prob": [round(float(v), 4) for v in y_prob_te.tolist()],
            "indexes": [int(v) for v in te_idx.tolist()],
        },
        "n_train_labeled": int(len(y_lab)),
        "n_pool": int(len(y_pool)),
        "n_clusters_default": int(n_cl),
    }
    os.makedirs(UI_DATA, exist_ok=True)
    out_state = os.path.join(UI_DATA, "workbench_state.json")
    with open(out_state, "w") as f:
        json.dump(state, f)
    sz_state = os.path.getsize(out_state) / 1024
    print(f"  → {out_state} ({sz_state:.0f} KB)", flush=True)

    # ──────────── workbench_alerts.json ────────────
    # Per-test-alert metadata (no source code yet — that's served on demand from backend)
    rule_idx_back = {v: k for k, v in meta["rule_to_idx"].items()}
    alerts = []
    for k, gi in enumerate(te_idx):
        r = raw[int(gi)]
        alerts.append({
            "id": int(gi),
            "rule_id": r["rule_id"],
            "rule_category": r["rule_category"],
            "level": r["level"],
            "source": r["source"],
            "file_path": r["file_path"],
            "start_line": int(r["start_line"]),
            "test_name": r.get("test_name", ""),
            "test_cwe": r.get("test_cwe", ""),
            "y_true": int(y_te[k]),
            "y_prob": round(float(y_prob_te[k]), 4),
        })
    out_alerts = os.path.join(UI_DATA, "workbench_alerts.json")
    with open(out_alerts, "w") as f:
        json.dump(alerts, f)
    sz_alerts = os.path.getsize(out_alerts) / 1024
    print(f"  → {out_alerts} ({sz_alerts:.0f} KB · {len(alerts)} alerts)", flush=True)

    # ──────────── workbench_pool.json ────────────
    pool_data = []
    for k, gi in enumerate(pool_idx):
        r = raw[int(gi)]
        pool_data.append({
            "id": int(gi),
            "rule_id": r["rule_id"],
            "rule_category": r["rule_category"],
            "source": r["source"],
            "file_path": r["file_path"],
            "start_line": int(r["start_line"]),
            "y_true": int(y_pool[k]),
            "y_prob": round(float(y_prob_pool[k]), 4),
            "uncertainty": round(float(abs(y_prob_pool[k] - 0.5)), 4),
        })
    pool_data.sort(key=lambda d: d["uncertainty"])  # most uncertain first
    out_pool = os.path.join(UI_DATA, "workbench_pool.json")
    with open(out_pool, "w") as f:
        json.dump(pool_data[:2000], f)  # cap to 2000 most uncertain
    sz_pool = os.path.getsize(out_pool) / 1024
    print(f"  → {out_pool} ({sz_pool:.0f} KB · {min(2000, len(pool_data))} most uncertain)", flush=True)

    print("\nDone. The workbench is ready to consume these.", flush=True)


if __name__ == "__main__":
    main()
