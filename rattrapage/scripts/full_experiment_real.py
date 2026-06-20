#!/usr/bin/env python3
"""
Full re-evaluation of the AlertOptimizer pipeline on real data (rattrapage).

Optimizations vs first draft:
  - chunked_dbscan (O(n) memory instead of O(n²·d))
  - stratified subsampling of labeled set for DBSCAN to keep clustering tractable
  - multiprocessing across seeds (EXP 6) and FP subsamples (EXP 5)
  - line-buffered stdout for live progress

EXP 1 : Main pipeline (DBSCAN + RF)
EXP 2 : Feature importance (permutation)
EXP 3 : Active learning — perfect oracle (5 cycles × 150 queries)
EXP 4 : Active learning — noisy oracle (10% error)
EXP 5 : Sensitivity to FP rate (subsampling on real)
EXP 6 : Stability across 5 seeds
EXP 7 : Threshold sweep
EXP 8 : ROC / PR curves data
Hypotheses : H1, H2, H3 (verdicts on real data)
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

# Force line-buffered stdout so we can watch progress live in /tmp/full_exp.log
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(THIS, "..", "..")))
sys.path.insert(0, THIS)
from alertoptimizer import (  # noqa: E402
    RandomForest, assign_test_clusters, enrich_clusters,
    metrics, roc_auc, pr_auc, find_threshold,
)
from fast_helpers import chunked_dbscan, stratified_subsample, patch_random_forest  # noqa: E402

# Speed up tree inference (matters a lot on 33k test samples × 50 trees × 11 features for permutation importance).
patch_random_forest()

ROOT = os.path.join(THIS, "..")
DATA = os.path.join(ROOT, "results", "real_dataset_v2.csv")
RESULTS_DIR = os.path.join(ROOT, "results")

SEEDS = [42, 123, 256, 512, 1024]
PRIMARY_SEED = 42

# DBSCAN tractability: cap the labeled set used for clustering.
# The RF still trains on the full labeled set.
DBSCAN_MAX_LABELED = 1500
N_TREES = 50
MAX_DEPTH = 14


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ============================================================
# DATASET LOADING
# ============================================================

def load_real_v2(csv_path=DATA, add_context_feature=True):
    raw = []
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            raw.append(row)
    if not raw:
        raise ValueError(f"Empty {csv_path}")

    rule_ids = sorted({r["rule_id"] for r in raw})
    tools = sorted({r["tool"] for r in raw})
    levels = ["error", "warning", "note", "none"]
    level_idx = {l: i for i, l in enumerate(levels)}
    sources = sorted({r["source"] for r in raw})

    file_counts = {}
    for r in raw:
        file_counts[r["file_path"]] = file_counts.get(r["file_path"], 0) + 1
    lines = sorted(int(r["start_line"]) for r in raw)
    line_p99 = lines[int(0.99 * len(lines))] if lines else 1

    rule_to_idx = {rid: i for i, rid in enumerate(rule_ids)}
    tool_to_idx = {t: i for i, t in enumerate(tools)}
    source_to_idx = {s: i for i, s in enumerate(sources)}

    level_to_rank = {"error": 1.0, "warning": 0.66, "note": 0.33, "none": 0.0}
    level_to_sev = {"error": 0.9, "warning": 0.6, "note": 0.3, "none": 0.1}

    n_feat = 9 if add_context_feature else 8
    n = len(raw)
    X = np.zeros((n, n_feat))
    y = np.zeros(n, dtype=int)

    for i, r in enumerate(raw):
        rule_i = rule_to_idx[r["rule_id"]]
        tool_i = tool_to_idx[r["tool"]]
        lvl = r["level"] if r["level"] in level_idx else "warning"
        lvl_i = level_idx[lvl]
        src_i = source_to_idx[r["source"]]

        X[i, 0] = rule_i / max(len(rule_ids) - 1, 1)
        X[i, 1] = lvl_i / 3.0
        X[i, 2] = src_i / max(len(sources) - 1, 1)
        X[i, 3] = tool_i / max(len(tools) - 1, 1)
        X[i, 4] = min(int(r["start_line"]) / max(line_p99, 1), 1.0)
        X[i, 5] = level_to_rank[lvl]
        X[i, 6] = min(file_counts[r["file_path"]] / 15.0, 1.0)
        X[i, 7] = level_to_sev[lvl]
        if add_context_feature:
            rid_low = r["rule_id"].lower()
            X[i, 8] = 1.0 if ("tainted" in rid_low or "path-traversal" in rid_low or
                              "no-direct-response-writer" in rid_low or
                              "trust_boundary" in rid_low or
                              "servlet_parameter" in rid_low) else 0.0

        y[i] = 1 if r["is_fp"] in ("True", True, "1") else 0

    return X, y, raw, {
        "rule_ids": rule_ids, "tools": tools, "sources": sources,
        "rule_to_idx": rule_to_idx,
    }


def stratified_split(y, seed=42, labeled_ratio=0.10, pool_ratio=0.40):
    rng = np.random.RandomState(seed)
    fp_idx, tp_idx = np.where(y == 1)[0], np.where(y == 0)[0]
    rng.shuffle(fp_idx); rng.shuffle(tp_idx)

    def split_class(idx):
        n_lab = max(1, int(labeled_ratio * len(idx)))
        n_pool = max(1, int(pool_ratio * len(idx)))
        return idx[:n_lab], idx[n_lab:n_lab + n_pool], idx[n_lab + n_pool:]

    lab_f, pool_f, te_f = split_class(fp_idx)
    lab_t, pool_t, te_t = split_class(tp_idx)
    return (np.concatenate([lab_f, lab_t]),
            np.concatenate([pool_f, pool_t]),
            np.concatenate([te_f, te_t]))


def _strat_val_split(y, seed, val_ratio=0.2):
    """Split labeled indices into (fit, val), stratified on y.

    The decision threshold is chosen on `val` so it never sees the test set.
    Same convention as the Généralisation/Adaptation workshops (lodo_ablation.py).
    """
    rng = np.random.RandomState(seed)
    fit, val = [], []
    for cls in (0, 1):
        idx = np.where(y == cls)[0]
        rng.shuffle(idx)
        n_val = max(1, int(val_ratio * len(idx)))
        val.extend(idx[:n_val].tolist())
        fit.extend(idx[n_val:].tolist())
    return np.array(fit), np.array(val)


def baseline_groupby_rule(X_lab, y_lab, X_te, rule_col=0, n_rules=None, alpha=1.0, beta=1.0):
    rules_lab = X_lab[:, rule_col]
    rules_te = X_te[:, rule_col]
    if n_rules is None:
        diffs = np.diff(np.sort(np.unique(rules_lab)))
        n_rules = int(round(1.0 / min(diffs, default=1.0))) + 1
    rb_lab = np.round(rules_lab * (n_rules - 1)).astype(int)
    rb_te = np.round(rules_te * (n_rules - 1)).astype(int)
    global_prior = float(np.mean(y_lab))
    per_rule = {}
    for r in np.unique(rb_lab):
        m = rb_lab == r
        n_fp = int(np.sum(y_lab[m]))
        n = int(np.sum(m))
        per_rule[int(r)] = (n_fp + alpha) / (n + alpha + beta)
    return np.array([per_rule.get(int(r), global_prior) for r in rb_te])


# ============================================================
# Pipeline core (factored so workers can call it cleanly)
# ============================================================

def run_pipeline_seed(seed, X, y, n_rules):
    """Run the DBSCAN + RF pipeline for one seed. Returns dict of metrics + tensors needed for AL."""
    lab_idx, pool_idx, te_idx = stratified_split(y, seed=seed)
    X_lab, y_lab = X[lab_idx], y[lab_idx]
    X_te, y_te = X[te_idx], y[te_idx]

    # --- Hold out a stratified validation slice of the labeled set ---
    # The decision threshold is selected on this slice, never on the test set.
    fit_i, val_i = _strat_val_split(y_lab, seed)
    X_fit, y_fit = X_lab[fit_i], y_lab[fit_i]
    X_val, y_val = X_lab[val_i], y_lab[val_i]

    # --- DBSCAN on a stratified subsample of the FIT set only ---
    db_idx = stratified_subsample(np.arange(len(fit_i)), y_fit, DBSCAN_MAX_LABELED, seed=seed)
    X_db = X_fit[db_idx][:, [0, 1, 2, 3]]
    y_db = y_fit[db_idx]
    t0 = time.time()
    cl_db = chunked_dbscan(X_db, eps=0.25, min_pts=3)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
    noise_pct = float(np.mean(cl_db == -1))
    t_dbscan = time.time() - t0

    # Assign fit + val + test points to clusters (nearest cluster centroid)
    cl_fit, _ = assign_test_clusters(X_fit[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
    cl_val, _ = assign_test_clusters(X_val[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
    cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)

    # Build cluster_fp_rate from the DBSCAN sub-sample (fit only)
    _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
    X_fit_full, _ = enrich_clusters(X_fit, cl_fit, y_fit, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_val_full, _ = enrich_clusters(X_val, cl_val, y_val, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)

    # --- RF training on the FIT portion of the labeled set ---
    t0 = time.time()
    rf = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=seed)
    rf.fit(X_fit_full, y_fit)
    t_rf = time.time() - t0
    y_prob = rf.predict_proba(X_te_full)

    # Threshold chosen on the held-out validation slice of TRAIN (no test leakage)
    p_val = rf.predict_proba(X_val_full)
    best_t = find_threshold(y_val, p_val, "f1", min_recall=0.85, min_red=0.50)
    m = metrics(y_te, y_prob, best_t)
    return {
        "seed": seed,
        "n_train_labeled": int(len(y_fit)),
        "n_val": int(len(y_val)),
        "n_dbscan_labeled": int(len(db_idx)),
        "n_test": int(len(y_te)),
        "n_clusters": n_cl,
        "noise_pct": noise_pct,
        "best_threshold": best_t,
        "metrics": m,
        "roc_auc": roc_auc(y_te, y_prob),
        "pr_auc": pr_auc(y_te, y_prob),
        "oob_error": float(rf.oob_error) if rf.oob_error else None,
        "timings": {"dbscan_s": round(t_dbscan, 2), "rf_train_s": round(t_rf, 2)},
        "_X_lab_full": X_fit_full, "_y_lab": y_fit,
        "_X_val_full": X_val_full, "_y_val": y_val,
        "_X_te_full": X_te_full, "_y_te": y_te,
        "_X_pool": X[pool_idx], "_y_pool": y[pool_idx],
        "_rf": rf, "_cl_db": cl_db, "_cl_fp_map": cl_fp_map,
        "_X_db": X_db, "_n_cl": n_cl, "_y_prob": y_prob,
    }


# ============================================================
# Worker wrappers (for multiprocessing pickling)
# ============================================================

def _worker_seed(args):
    """One full seed run for EXP 6 (returns lightweight summary)."""
    seed = args
    log(f"  [worker seed={seed}] starting")
    X, y, _, meta = load_real_v2()
    n_rules = len(meta["rule_ids"])
    r = run_pipeline_seed(seed, X, y, n_rules)
    log(f"  [worker seed={seed}] done  F1={r['metrics']['f1']:.3f}  "
        f"ROC={r['roc_auc']:.3f}  DBSCAN={r['n_clusters']}cl "
        f"({r['timings']['dbscan_s']:.0f}s)  RF={r['timings']['rf_train_s']:.0f}s")
    return {
        "seed": seed,
        "f1": r["metrics"]["f1"],
        "prec": r["metrics"]["precision"],
        "rec": r["metrics"]["recall"],
        "red": r["metrics"]["reduction"],
        "roc": r["roc_auc"],
        "pr": r["pr_auc"],
        "n_clusters": r["n_clusters"],
        "dbscan_s": r["timings"]["dbscan_s"],
        "rf_train_s": r["timings"]["rf_train_s"],
    }


def _worker_fp_sample(args):
    """One FP-subsample run for EXP 5."""
    target, seed = args
    log(f"  [worker FP={target:.0%}] starting")
    X_all, y_all, _, meta = load_real_v2()
    n_rules = len(meta["rule_ids"])
    fp_idx = np.where(y_all == 1)[0]
    tp_idx = np.where(y_all == 0)[0]
    rng = np.random.RandomState(seed)
    n_target = 3000
    n_fp = min(int(target * n_target), len(fp_idx))
    n_tp = min(n_target - n_fp, len(tp_idx))
    sel = np.concatenate([rng.choice(fp_idx, n_fp, replace=False),
                          rng.choice(tp_idx, n_tp, replace=False)])
    rng.shuffle(sel)
    X, y = X_all[sel], y_all[sel]
    r = run_pipeline_seed(seed, X, y, n_rules)
    log(f"  [worker FP={target:.0%}] done  actual={np.mean(y):.1%}  F1={r['metrics']['f1']:.3f}  Réd={r['metrics']['reduction']:.1%}")
    return {
        "target_fp_rate": target,
        "actual_fp_rate": float(np.mean(y)),
        "n_test": r["n_test"],
        "n_clusters": r["n_clusters"],
        **r["metrics"],
        "best_threshold": r["best_threshold"],
        "roc_auc": r["roc_auc"],
    }


# ============================================================
# EXP 2 : Feature importance
# ============================================================

def exp2_feature_importance(r1):
    rf = r1["_rf"]
    X_te = r1["_X_te_full"]
    y_te = r1["_y_te"]
    best_t = r1["best_threshold"]
    base_f1 = metrics(y_te, rf.predict_proba(X_te), best_t)["f1"]
    base_roc = roc_auc(y_te, rf.predict_proba(X_te))

    feat_names = ["rule.id", "level", "source", "tool.name",
                  "start_line", "rank", "occurrenceCount", "severity",
                  "is_ctx_rule", "cluster_fp_rate", "cluster_size"]
    rng = np.random.RandomState(42)
    rows = []
    for i in range(min(len(feat_names), X_te.shape[1])):
        Xp = X_te.copy()
        Xp[:, i] = rng.permutation(Xp[:, i])
        m_perm = metrics(y_te, rf.predict_proba(Xp), best_t)
        roc_perm = roc_auc(y_te, rf.predict_proba(Xp))
        rows.append({
            "feature": feat_names[i],
            "f1_drop": round(base_f1 - m_perm["f1"], 4),
            "roc_drop": round(base_roc - roc_perm, 4),
        })
    tot_f1 = max(sum(max(r["f1_drop"], 0) for r in rows), 1e-10)
    tot_roc = max(sum(max(r["roc_drop"], 0) for r in rows), 1e-10)
    for r in rows:
        r["f1_imp"] = round(max(r["f1_drop"], 0) / tot_f1, 4)
        r["roc_imp"] = round(max(r["roc_drop"], 0) / tot_roc, 4)
    rows.sort(key=lambda r: -r["roc_imp"])
    return {"base_f1": base_f1, "base_roc": base_roc, "importances": rows}


# ============================================================
# EXP 3 & 4 : Active learning (perfect + noisy)
# ============================================================

def active_learning_real(r1, cycles=5, feedback=150, noise=0.0, seed=PRIMARY_SEED):
    rng = np.random.RandomState(seed + 2000)

    X_lab = r1["_X_lab_full"].copy()
    y_lab = r1["_y_lab"].copy()
    X_pool_raw = r1["_X_pool"].copy()
    y_pool = r1["_y_pool"].copy()

    # Enrich pool with cluster features (use the DBSCAN-subsampled labeled centroids)
    cl_db = r1["_cl_db"]
    cl_fp_map = r1["_cl_fp_map"]
    n_cl = r1["_n_cl"]
    X_db = r1["_X_db"]
    cl_pool, _ = assign_test_clusters(X_pool_raw[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
    X_pool_full, _ = enrich_clusters(X_pool_raw, cl_pool, y_pool, n_cl,
                                      is_train=False, cl_fp_map=cl_fp_map)

    X_te = r1["_X_te_full"]
    y_te = r1["_y_te"]
    X_val = r1["_X_val_full"]
    y_val = r1["_y_val"]

    rf = r1["_rf"]
    y_p = rf.predict_proba(X_te)
    best_t = r1["best_threshold"]
    m = metrics(y_te, y_p, best_t)
    out = [{
        "cycle": 0, "fb": 0, "f1": m["f1"], "prec": m["precision"],
        "rec": m["recall"], "red": m["reduction"], "pool_size": len(X_pool_full),
        "threshold": best_t,
    }]
    for c in range(1, cycles + 1):
        if len(X_pool_full) < feedback:
            break
        log(f"  AL cycle {c}/{cycles} (noise={noise:.0%}) — fitting on {len(X_lab)} samples")
        p_pool = rf.predict_proba(X_pool_full)
        unc_idx = np.argsort(np.abs(p_pool - 0.5))[:feedback]
        fb_labels = y_pool[unc_idx].copy()
        if noise > 0:
            n_flip = max(1, int(noise * len(fb_labels)))
            flip = rng.choice(len(fb_labels), n_flip, replace=False)
            fb_labels[flip] = 1 - fb_labels[flip]
        X_lab = np.vstack([X_lab, X_pool_full[unc_idx]])
        y_lab = np.concatenate([y_lab, fb_labels])
        mask = np.ones(len(X_pool_full), dtype=bool)
        mask[unc_idx] = False
        X_pool_full = X_pool_full[mask]
        y_pool = y_pool[mask]
        new_rf = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=seed + c * 13)
        new_rf.fit(X_lab, y_lab)
        rf = new_rf
        y_p = rf.predict_proba(X_te)
        # Threshold re-tuned on the held-out validation slice, not on test
        new_t = find_threshold(y_val, rf.predict_proba(X_val), "f1", min_recall=0.85, min_red=0.50)
        m = metrics(y_te, y_p, new_t)
        out.append({
            "cycle": c, "fb": c * feedback, "f1": m["f1"], "prec": m["precision"],
            "rec": m["recall"], "red": m["reduction"], "pool_size": len(X_pool_full),
            "threshold": new_t,
        })
    return out


# ============================================================
# Baselines (same primary seed)
# ============================================================

def baselines_comparison(r1):
    X_lab = r1["_X_lab_full"]
    y_lab = r1["_y_lab"]
    X_val = r1["_X_val_full"]
    y_val = r1["_y_val"]
    X_te = r1["_X_te_full"]
    y_te = r1["_y_te"]
    n_rules = None  # let baseline infer

    # All baseline thresholds are selected on the held-out validation slice (no test leakage).

    # B2: RF without cluster features
    def _strip_cluster(Xm):
        return np.column_stack([Xm[:, :-2], np.full(len(Xm), 0.5), np.zeros(len(Xm))])
    X_lab_nc = _strip_cluster(X_lab)
    X_val_nc = _strip_cluster(X_val)
    X_te_nc = _strip_cluster(X_te)
    rf_nc = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=r1["seed"])
    rf_nc.fit(X_lab_nc, y_lab)
    t_b2 = find_threshold(y_val, rf_nc.predict_proba(X_val_nc), "f1", min_recall=0.85, min_red=0.50)
    y_b2 = rf_nc.predict_proba(X_te_nc)
    m_b2 = metrics(y_te, y_b2, t_b2)

    # B4: GROUP BY rule_id
    t_b4 = find_threshold(y_val, baseline_groupby_rule(X_lab, y_lab, X_val, n_rules=n_rules), "f1")
    y_b4 = baseline_groupby_rule(X_lab, y_lab, X_te, n_rules=n_rules)
    m_b4 = metrics(y_te, y_b4, t_b4)

    # B0 random, B1 majority
    rng = np.random.RandomState(42)
    t_b0 = find_threshold(y_val, rng.random(len(y_val)), "f1")
    y_b0 = rng.random(len(y_te))
    m_b0 = metrics(y_te, y_b0, t_b0)
    y_b1 = np.full(len(y_te), float(np.mean(y_lab)))
    m_b1 = metrics(y_te, y_b1, 0.5)

    return {
        "b0_random": {"metrics": m_b0, "threshold": t_b0},
        "b1_majority": {"metrics": m_b1, "threshold": 0.5},
        "b2_rf_no_dbscan": {"metrics": m_b2, "threshold": t_b2,
                             "roc_auc": roc_auc(y_te, y_b2), "pr_auc": pr_auc(y_te, y_b2)},
        "b4_groupby_rule": {"metrics": m_b4, "threshold": t_b4,
                             "roc_auc": roc_auc(y_te, y_b4), "pr_auc": pr_auc(y_te, y_b4)},
    }


# ============================================================
# EXP 7 & 8
# ============================================================

def exp7_threshold_sweep(r1):
    y_te = r1["_y_te"]
    y_prob = r1["_y_prob"]
    rows = []
    for t in np.arange(0.10, 0.95, 0.05):
        t = round(float(t), 2)
        m = metrics(y_te, y_prob, t)
        rows.append({"threshold": t, **m})
    return rows


def exp8_roc_pr_data(r1):
    y_te = r1["_y_te"]
    y_prob = r1["_y_prob"]
    roc_pts, pr_pts = [], []
    for t in np.arange(0.01, 0.99, 0.02):
        t = round(float(t), 3)
        m = metrics(y_te, y_prob, t)
        fpr = m["fp_kept"] / max(m["fp_kept"] + m["tn"], 1)
        roc_pts.append({"threshold": t, "tpr": m["recall"], "fpr": round(fpr, 4)})
        pr_pts.append({"threshold": t, "precision": m["precision"], "recall": m["recall"]})
    return {"roc": roc_pts, "pr": pr_pts}


# ============================================================
# MAIN
# ============================================================

def numpy_default(o):
    if isinstance(o, np.floating): return float(o)
    if isinstance(o, np.integer):  return int(o)
    if isinstance(o, np.ndarray):  return o.tolist()
    if isinstance(o, np.bool_):    return bool(o)
    return str(o)


def main():
    t_overall = time.time()
    print("=" * 70, flush=True)
    print("  AlertOptimizer — Full re-evaluation on REAL data (rattrapage v2)", flush=True)
    print("=" * 70, flush=True)

    log("Loading dataset…")
    X, y, raw, meta = load_real_v2()
    n_rules = len(meta["rule_ids"])
    log(f"  {len(y)} alerts, {n_rules} rules, FP rate {np.mean(y):.1%}")

    log("EXP 1: pipeline principal (seed=42)…")
    r1 = run_pipeline_seed(PRIMARY_SEED, X, y, n_rules)
    log(f"  DBSCAN: {r1['n_clusters']} clusters ({r1['noise_pct']:.1%} bruit) in {r1['timings']['dbscan_s']:.0f}s")
    log(f"  RF: trained in {r1['timings']['rf_train_s']:.0f}s")
    m = r1["metrics"]
    log(f"  → F1={m['f1']:.3f}  Prec={m['precision']:.3f}  Rec={m['recall']:.3f}  Réd={m['reduction']:.1%}")
    log(f"  → ROC-AUC={r1['roc_auc']:.3f}  PR-AUC={r1['pr_auc']:.3f}  OOB={r1['oob_error']}")
    r1["seed"] = PRIMARY_SEED

    log("Baselines…")
    bls = baselines_comparison(r1)
    for name, key in [("B0 random", "b0_random"), ("B1 majority", "b1_majority"),
                       ("B2 RF only (no DBSCAN)", "b2_rf_no_dbscan"),
                       ("B4 GROUP BY rule_id", "b4_groupby_rule")]:
        m = bls[key]["metrics"]
        log(f"  {name:<28s} F1={m['f1']:.3f}  Prec={m['precision']:.3f}  Rec={m['recall']:.3f}  Réd={m['reduction']:.1%}")

    log("EXP 2: feature importance…")
    imp = exp2_feature_importance(r1)
    for r in imp["importances"]:
        log(f"  {r['feature']:<22s} F1↓={r['f1_drop']:>7.4f} ({r['f1_imp']:>5.1%})  ROC↓={r['roc_drop']:>7.4f} ({r['roc_imp']:>5.1%})")

    log("EXP 3: active learning perfect oracle…")
    al_p = active_learning_real(r1, cycles=5, feedback=150, noise=0.0)
    for c in al_p:
        delta = f"{c['f1']-al_p[0]['f1']:+.3f}" if c['cycle']>0 else "   —  "
        log(f"  C{c['cycle']}: F1={c['f1']:.3f}  Prec={c['prec']:.3f}  Rec={c['rec']:.3f}  Δ={delta}")

    log("EXP 4: active learning noisy oracle (10%)…")
    al_n = active_learning_real(r1, cycles=5, feedback=150, noise=0.10)
    for cp, cn in zip(al_p, al_n):
        log(f"  C{cp['cycle']}: parfait={cp['f1']:.3f}  bruité={cn['f1']:.3f}  Δ={cp['f1']-cn['f1']:+.3f}")

    log("EXP 5: sensibilité au taux de FP (parallèle, 5 workers)…")
    fp_args = [(t, PRIMARY_SEED) for t in (0.30, 0.40, 0.50, 0.60, 0.70)]
    with Pool(5) as p:
        fp_sens = p.map(_worker_fp_sample, fp_args)

    log("EXP 6: stabilité inter-seeds (parallèle, 5 workers)…")
    with Pool(5) as p:
        seed_rows = p.map(_worker_seed, SEEDS)
    f1s = [r["f1"] for r in seed_rows]
    log(f"  Moyenne±σ: F1={np.mean(f1s):.3f}±{np.std(f1s):.3f}")

    log("EXP 7: sweep de seuils…")
    th = exp7_threshold_sweep(r1)
    log("  Seuil | Prec | Rec | F1 | Réd | VPmanqués")
    for r in th:
        flag = " ◄" if abs(r['threshold'] - r1['best_threshold']) < 0.025 else ""
        log(f"  {r['threshold']:.2f}  | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} | {r['reduction']:.1%}  | {r['vp_missed']:>4d}{flag}")

    log("EXP 8: ROC / PR data…")
    rocpr = exp8_roc_pr_data(r1)
    log(f"  ROC-AUC={r1['roc_auc']:.3f}, PR-AUC={r1['pr_auc']:.3f}, {len(rocpr['roc'])} points")

    # Hypotheses
    delta_h2 = r1["metrics"]["f1"] - bls["b2_rf_no_dbscan"]["metrics"]["f1"]
    al_dp = al_p[-1]["f1"] - al_p[0]["f1"]
    al_dn = al_n[-1]["f1"] - al_n[0]["f1"]
    h1 = r1["metrics"]["reduction"] > 0.50 and r1["metrics"]["recall"] >= 0.85
    h2 = delta_h2 >= 0.05
    h3p = al_dp >= 0.03
    h3n = al_dn >= 0.03

    log("=" * 70)
    log("VERDICTS DES HYPOTHÈSES (dataset réel 66k alertes)")
    log(f"  H1 : Réd={r1['metrics']['reduction']:.1%}>50% ET Rec={r1['metrics']['recall']:.3f}≥0.85 → {'VALIDÉE ✓' if h1 else 'NON VALIDÉE ✗'}")
    log(f"  H2 : ΔF1(DBSCAN)={delta_h2:+.3f}≥0.05 → {'VALIDÉE ✓' if h2 else 'NON VALIDÉE ✗'}")
    log(f"  H3 parfait: ΔF1(AL 5 cycles)={al_dp:+.3f}≥0.03 → {'VALIDÉE ✓' if h3p else 'NON VALIDÉE ✗'}")
    log(f"  H3 bruité : ΔF1(AL 5 cycles 10%)={al_dn:+.3f}≥0.03 → {'VALIDÉE ✓' if h3n else 'NON VALIDÉE ✗'}")
    log("=" * 70)
    log(f"Total time: {time.time()-t_overall:.0f}s")

    out = {
        "exp1_main": {k: v for k, v in r1.items() if not k.startswith("_")},
        "exp2_feature_importance": imp,
        "exp3_active_learning_perfect": al_p,
        "exp4_active_learning_noisy": al_n,
        "exp5_fp_sensitivity": fp_sens,
        "exp6_multi_seed": seed_rows,
        "exp7_threshold_sweep": th,
        "exp8_roc_pr": rocpr,
        "baselines": bls,
        "hypotheses": {
            "H1": h1, "H2": h2, "H3_perfect": h3p, "H3_noisy": h3n,
            "deltas": {
                "H2_delta_f1": delta_h2,
                "H3_perfect_delta_f1": al_dp,
                "H3_noisy_delta_f1": al_dn,
            }
        }
    }
    out_path = os.path.join(RESULTS_DIR, "full_experiment_results.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, default=numpy_default)
    log(f"Saved → {out_path}")


if __name__ == "__main__":
    main()
