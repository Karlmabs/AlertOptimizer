#!/usr/bin/env python3
"""
Grid search of DBSCAN + Random Forest hyperparameters on the real dataset.

Same grids as the v6 thesis (section 2.4) but run on real data:
  DBSCAN: eps × min_pts
  RF:     n_estimators × max_depth

Output:
  results/hyperparam_dbscan.csv
  results/hyperparam_rf.csv
  results/hyperparam_summary.md
"""
from __future__ import annotations

import csv
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

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
from full_experiment_real import load_real_v2, stratified_split, _strat_val_split  # noqa: E402

patch_random_forest()

RESULTS_DIR = os.path.join(THIS, "..", "results")
SEED = 42
DBSCAN_MAX_LABELED = 1500


# ============================================================
# DBSCAN grid
# ============================================================

DBSCAN_EPS_GRID = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.50]
DBSCAN_MINPTS_GRID = [2, 3, 5, 7, 10, 15]

RF_NESTIM_GRID = [10, 20, 30, 50, 75, 100, 150]
RF_DEPTH_GRID = [4, 6, 8, 10, 12, 14, 16, 20, 30]


def prepare_data(seed=SEED):
    X, y, _, _ = load_real_v2(add_context_feature=True)
    lab_idx, _, te_idx = stratified_split(y, seed=seed)
    X_lab, y_lab = X[lab_idx], y[lab_idx]
    X_te, y_te = X[te_idx], y[te_idx]
    # Hold out a stratified validation slice of labeled for threshold + config selection
    fit_i, val_i = _strat_val_split(y_lab, seed)
    X_fit, y_fit = X_lab[fit_i], y_lab[fit_i]
    X_val, y_val = X_lab[val_i], y_lab[val_i]
    db_idx = stratified_subsample(np.arange(len(fit_i)), y_fit, DBSCAN_MAX_LABELED, seed=seed)
    return X_fit, y_fit, X_val, y_val, X_te, y_te, db_idx


def _dbscan_combo(args):
    eps, min_pts = args
    X_fit, y_fit, X_val, y_val, X_te, y_te, db_idx = prepare_data()
    X_db = X_fit[db_idx][:, [0, 1, 2, 3]]
    y_db = y_fit[db_idx]

    t0 = time.time()
    cl_db = chunked_dbscan(X_db, eps=eps, min_pts=min_pts)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
    noise_pct = float(np.mean(cl_db == -1))
    t_db = time.time() - t0

    cl_fit, _ = assign_test_clusters(X_fit[:, [0, 1, 2, 3]], X_db, cl_db, eps)
    cl_val, _ = assign_test_clusters(X_val[:, [0, 1, 2, 3]], X_db, cl_db, eps)
    cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, eps)
    _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
    X_fit_full, _ = enrich_clusters(X_fit, cl_fit, y_fit, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_val_full, _ = enrich_clusters(X_val, cl_val, y_val, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)

    # Fixed RF hyperparameters during DBSCAN sweep (mémoire defaults)
    rf = RandomForest(n_estimators=50, max_depth=14, random_state=SEED)
    rf.fit(X_fit_full, y_fit)
    # Threshold + config ranking on validation; final metrics reported on test
    best_t = find_threshold(y_val, rf.predict_proba(X_val_full), "f1", min_recall=0.85, min_red=0.50)
    f1_val = metrics(y_val, rf.predict_proba(X_val_full), best_t)["f1"]
    y_prob = rf.predict_proba(X_te_full)
    m = metrics(y_te, y_prob, best_t)
    out = {
        "eps": eps, "min_pts": min_pts,
        "n_clusters": n_cl,
        "noise_pct": round(noise_pct, 4),
        "dbscan_s": round(t_db, 2),
        "best_threshold": best_t,
        "f1_val": round(f1_val, 4),
        **{k: round(v, 4) if isinstance(v, float) else v for k, v in m.items()},
        "roc_auc": roc_auc(y_te, y_prob),
        "pr_auc": pr_auc(y_te, y_prob),
    }
    print(f"  eps={eps:.2f} min_pts={min_pts:>2d} | clusters={n_cl:>3d} noise={noise_pct:.1%}"
          f" | F1={out['f1']:.3f} Rec={out['recall']:.3f} Réd={out['reduction']:.1%} ROC={out['roc_auc']:.3f}",
          flush=True)
    return out


def _rf_combo(args):
    n_estim, max_depth, best_eps, best_minpts = args
    X_fit, y_fit, X_val, y_val, X_te, y_te, db_idx = prepare_data()
    X_db = X_fit[db_idx][:, [0, 1, 2, 3]]
    y_db = y_fit[db_idx]

    cl_db = chunked_dbscan(X_db, eps=best_eps, min_pts=best_minpts)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
    cl_fit, _ = assign_test_clusters(X_fit[:, [0, 1, 2, 3]], X_db, cl_db, best_eps)
    cl_val, _ = assign_test_clusters(X_val[:, [0, 1, 2, 3]], X_db, cl_db, best_eps)
    cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, best_eps)
    _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
    X_fit_full, _ = enrich_clusters(X_fit, cl_fit, y_fit, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_val_full, _ = enrich_clusters(X_val, cl_val, y_val, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)

    t0 = time.time()
    rf = RandomForest(n_estimators=n_estim, max_depth=max_depth, random_state=SEED)
    rf.fit(X_fit_full, y_fit)
    t_train = time.time() - t0
    # Threshold + config ranking on validation; final metrics reported on test
    best_t = find_threshold(y_val, rf.predict_proba(X_val_full), "f1", min_recall=0.85, min_red=0.50)
    f1_val = metrics(y_val, rf.predict_proba(X_val_full), best_t)["f1"]
    y_prob = rf.predict_proba(X_te_full)
    m = metrics(y_te, y_prob, best_t)
    out = {
        "n_estimators": n_estim, "max_depth": max_depth,
        "train_s": round(t_train, 2),
        "oob_error": round(float(rf.oob_error), 4) if rf.oob_error else None,
        "best_threshold": best_t,
        "f1_val": round(f1_val, 4),
        **{k: round(v, 4) if isinstance(v, float) else v for k, v in m.items()},
        "roc_auc": roc_auc(y_te, y_prob),
    }
    print(f"  n_est={n_estim:>3d} depth={max_depth:>2d} | train={t_train:>5.1f}s"
          f" | F1={out['f1']:.3f} Réd={out['reduction']:.1%} ROC={out['roc_auc']:.3f} OOB={out['oob_error']}",
          flush=True)
    return out


def main():
    print("=" * 70, flush=True)
    print("  Grid search of hyperparameters on REAL data (66 227 alerts)", flush=True)
    print("=" * 70, flush=True)

    print("\n--- DBSCAN grid: 7 ε × 6 MinPts = 42 combinations ---", flush=True)
    t_start = time.time()
    dbscan_args = [(eps, mp) for eps in DBSCAN_EPS_GRID for mp in DBSCAN_MINPTS_GRID]
    with Pool(8) as p:
        db_rows = p.map(_dbscan_combo, dbscan_args)
    print(f"  DBSCAN grid completed in {time.time()-t_start:.0f}s", flush=True)

    # Save DBSCAN CSV
    db_csv = os.path.join(RESULTS_DIR, "hyperparam_dbscan.csv")
    with open(db_csv, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(db_rows[0].keys()))
        w.writeheader()
        w.writerows(db_rows)
    print(f"  → {db_csv}", flush=True)

    # Find best DBSCAN config (by F1, with tie-break on recall then on cluster count being reasonable)
    def db_score(r):
        # Rank on VALIDATION F1 (no test leakage), then recall, then "reasonable" cluster count
        cluster_penalty = 0 if 3 <= r["n_clusters"] <= 60 else -0.001 * abs(r["n_clusters"] - 30)
        return r["f1_val"] + 0.0001 * r["recall"] + cluster_penalty
    best_db = max(db_rows, key=db_score)
    print(f"\n*** Best DBSCAN: eps={best_db['eps']}, min_pts={best_db['min_pts']} "
          f"→ F1={best_db['f1']:.3f}, Réd={best_db['reduction']:.1%}, clusters={best_db['n_clusters']} ***", flush=True)

    print("\n--- RF grid: 7 n_estimators × 9 max_depth = 63 combinations ---", flush=True)
    print(f"--- (DBSCAN fixed at eps={best_db['eps']}, min_pts={best_db['min_pts']}) ---", flush=True)
    t_start = time.time()
    rf_args = [(n, d, best_db["eps"], best_db["min_pts"])
                for n in RF_NESTIM_GRID for d in RF_DEPTH_GRID]
    with Pool(8) as p:
        rf_rows = p.map(_rf_combo, rf_args)
    print(f"  RF grid completed in {time.time()-t_start:.0f}s", flush=True)

    rf_csv = os.path.join(RESULTS_DIR, "hyperparam_rf.csv")
    with open(rf_csv, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rf_rows[0].keys()))
        w.writeheader()
        w.writerows(rf_rows)
    print(f"  → {rf_csv}", flush=True)

    # Best RF (by F1, with tie-break on lower train time when F1 is within 0.002)
    def rf_score(r):
        return r["f1_val"] - 0.0001 * r["train_s"]  # rank on validation F1, tiny penalty for slower
    best_rf = max(rf_rows, key=rf_score)
    print(f"\n*** Best RF: n_estimators={best_rf['n_estimators']}, max_depth={best_rf['max_depth']} "
          f"→ F1={best_rf['f1']:.3f}, OOB={best_rf['oob_error']}, train={best_rf['train_s']}s ***", flush=True)

    # Compare with v6 defaults
    v6 = next(r for r in rf_rows if r["n_estimators"] == 50 and r["max_depth"] == 14)
    print(f"\n--- Comparison with mémoire v6 (eps=0.25, min_pts=3, n_est=50, depth=14) ---", flush=True)
    v6_db = next(r for r in db_rows if r["eps"] == 0.25 and r["min_pts"] == 3)
    print(f"  DBSCAN @ (0.25, 3):  F1={v6_db['f1']:.3f}  vs best={best_db['f1']:.3f}  Δ={best_db['f1']-v6_db['f1']:+.3f}", flush=True)
    print(f"  RF     @ (50, 14):  F1={v6['f1']:.3f}  vs best={best_rf['f1']:.3f}  Δ={best_rf['f1']-v6['f1']:+.3f}", flush=True)

    # Markdown summary
    md = [
        "# Validation des hyperparamètres sur dataset réel (66 227 alertes)",
        "",
        f"Seed: {SEED}. Test set: 33 114 alertes. Métrique principale: F1 (sous contrainte recall ≥ 0,85, reduction ≥ 0,50).",
        "",
        "## A. Sensibilité DBSCAN (RF figé à n_estimators=50, max_depth=14)",
        "",
        "| ε | MinPts | F1 | Réduction | Rappel | Clusters | Bruit % | ROC-AUC |",
        "|---|---|---|---|---|---|---|---|",
    ]
    # Sort by F1 desc
    for r in sorted(db_rows, key=lambda x: -x["f1"])[:20]:  # top 20
        md.append(f"| {r['eps']} | {r['min_pts']} | **{r['f1']:.3f}** | {r['reduction']:.1%} | "
                  f"{r['recall']:.3f} | {r['n_clusters']} | {r['noise_pct']:.1%} | {r['roc_auc']:.3f} |")
    md += [
        "",
        f"**Meilleur**: ε={best_db['eps']}, MinPts={best_db['min_pts']} → F1={best_db['f1']:.3f}, Réd={best_db['reduction']:.1%}",
        f"**Mémoire (v6)**: ε=0.25, MinPts=3 → F1={v6_db['f1']:.3f}, Réd={v6_db['reduction']:.1%}",
        f"**Différentiel** : {best_db['f1']-v6_db['f1']:+.3f} pts F1",
        "",
        "## B. Sensibilité Random Forest (DBSCAN figé au meilleur de A)",
        "",
        f"DBSCAN fixé à ε={best_db['eps']}, MinPts={best_db['min_pts']}.",
        "",
        "| n_estimators | max_depth | F1 | Réduction | Rappel | Train (s) | OOB |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in sorted(rf_rows, key=lambda x: -x["f1"])[:25]:
        md.append(f"| {r['n_estimators']} | {r['max_depth']} | **{r['f1']:.3f}** | "
                  f"{r['reduction']:.1%} | {r['recall']:.3f} | {r['train_s']} | {r['oob_error']} |")
    md += [
        "",
        f"**Meilleur**: n_estimators={best_rf['n_estimators']}, max_depth={best_rf['max_depth']} → F1={best_rf['f1']:.3f}, OOB={best_rf['oob_error']}",
        f"**Mémoire (v6)**: n_estimators=50, max_depth=14 → F1={v6['f1']:.3f}, OOB={v6['oob_error']}",
        f"**Différentiel** : {best_rf['f1']-v6['f1']:+.3f} pts F1",
        "",
        "## C. Conclusion",
        "",
        f"Les hyperparamètres du mémoire restent {'globalement valides' if abs(best_db['f1']-v6_db['f1']) < 0.01 and abs(best_rf['f1']-v6['f1']) < 0.01 else 'à ajuster légèrement'} sur le dataset réel.",
    ]
    md_path = os.path.join(RESULTS_DIR, "hyperparam_summary.md")
    with open(md_path, "w") as f:
        f.write("\n".join(md))
    print(f"\nSaved → {md_path}", flush=True)


if __name__ == "__main__":
    main()
