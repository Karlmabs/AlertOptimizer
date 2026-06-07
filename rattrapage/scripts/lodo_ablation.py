#!/usr/bin/env python3
"""
LODO (Leave-One-Dataset-Out) + ablation sans rule.id.

Deux expériences qui répondent frontalement au jury :

1. GÉNÉRALISATION (LODO) — le modèle généralise-t-il à un dataset jamais vu ?
   On compare l'évaluation *in-distribution* (train et test dans le même
   dataset) à l'évaluation *cross-dataset* (train sur A, test sur B).
   Le gap diagonale↔cross EST le résultat scientifique.

2. ABLATION SANS rule.id — le modèle est-il une simple table de
   correspondance ? On ré-entraîne en neutralisant complètement la feature
   rule.id. Si le F1 tient → le modèle a appris autre chose que le rule_id.

Rigueur :
  - Le seuil de décision est choisi sur un VAL interne au TRAIN (jamais sur
    le test) → pas de fuite de seuil dans les chiffres cross-dataset.
  - La ROC-AUC (sans seuil) est la métrique de tête pour le cross.
  - La feature `source` (origine du dataset) est neutralisée dans toutes les
    cellules LODO : elle est constante dans un set et trahirait l'origine.
  - 3 graines, on rapporte moyenne ± σ.
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time

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
from full_experiment_real import load_real_v2  # noqa: E402

patch_random_forest()

ROOT = os.path.join(THIS, "..")
RESULTS_DIR = os.path.join(ROOT, "results")
UI_DATA = os.path.normpath(os.path.join(THIS, "..", "ui", "frontend", "public", "data"))

SEEDS = [42, 123, 256]
DBSCAN_MAX_LABELED = 1500
N_TREES = 50
MAX_DEPTH = 14
EPS = 0.25
MIN_PTS = 3
# Feature columns (see load_real_v2): 0=rule.id, 1=level, 2=source, 3=tool
COL_RULE = 0
COL_SOURCE = 2
DBSCAN_COLS = [0, 1, 2, 3]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _strat_val_split(y, seed, val_ratio=0.2):
    """Split indices into (fit, val), stratified on y."""
    rng = np.random.RandomState(seed)
    fit, val = [], []
    for cls in (0, 1):
        idx = np.where(y == cls)[0]
        rng.shuffle(idx)
        n_val = max(1, int(val_ratio * len(idx)))
        val.extend(idx[:n_val].tolist())
        fit.extend(idx[n_val:].tolist())
    return np.array(fit), np.array(val)


def pipeline_eval(X, y, tr_idx, te_idx, seed, use_rule_id=True, use_source=True):
    """Train on tr_idx, evaluate on te_idx. Threshold chosen on a val slice of train."""
    Xtr = X[tr_idx].copy(); ytr = y[tr_idx]
    Xte = X[te_idx].copy(); yte = y[te_idx]
    if not use_rule_id:
        Xtr[:, COL_RULE] = 0.0; Xte[:, COL_RULE] = 0.0
    if not use_source:
        Xtr[:, COL_SOURCE] = 0.0; Xte[:, COL_SOURCE] = 0.0

    fit_i, val_i = _strat_val_split(ytr, seed)
    Xfit, yfit = Xtr[fit_i], ytr[fit_i]
    Xval, yval = Xtr[val_i], ytr[val_i]

    # DBSCAN on a stratified subsample of the fit set
    db_idx = stratified_subsample(np.arange(len(yfit)), yfit, DBSCAN_MAX_LABELED, seed=seed)
    Xdb = Xfit[db_idx][:, DBSCAN_COLS]; ydb = yfit[db_idx]
    cl_db = chunked_dbscan(Xdb, eps=EPS, min_pts=MIN_PTS)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)

    cl_fit, _ = assign_test_clusters(Xfit[:, DBSCAN_COLS], Xdb, cl_db, EPS)
    cl_val, _ = assign_test_clusters(Xval[:, DBSCAN_COLS], Xdb, cl_db, EPS)
    cl_te, _ = assign_test_clusters(Xte[:, DBSCAN_COLS], Xdb, cl_db, EPS)
    _, cl_fp_map = enrich_clusters(Xdb, cl_db, ydb, n_cl, is_train=True)
    Xfit_f, _ = enrich_clusters(Xfit, cl_fit, yfit, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    Xval_f, _ = enrich_clusters(Xval, cl_val, yval, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    Xte_f, _ = enrich_clusters(Xte, cl_te, yte, n_cl, is_train=False, cl_fp_map=cl_fp_map)

    rf = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=seed)
    rf.fit(Xfit_f, yfit)

    # Threshold chosen on the held-out val of TRAIN (no test leakage)
    p_val = rf.predict_proba(Xval_f)
    t = find_threshold(yval, p_val, "f1", min_recall=0.85, min_red=0.50)

    p_te = rf.predict_proba(Xte_f)
    m = metrics(yte, p_te, t)
    return {
        "f1": m["f1"], "precision": m["precision"], "recall": m["recall"],
        "reduction": m["reduction"], "roc_auc": roc_auc(yte, p_te),
        "pr_auc": pr_auc(yte, p_te), "threshold": t,
        "n_train": int(len(tr_idx)), "n_test": int(len(te_idx)), "n_clusters": n_cl,
    }


def avg_over_seeds(X, y, tr_idx, te_idx, use_rule_id=True, use_source=True):
    runs = [pipeline_eval(X, y, tr_idx, te_idx, s, use_rule_id, use_source) for s in SEEDS]
    out = {"n_train": runs[0]["n_train"], "n_test": runs[0]["n_test"]}
    for k in ("f1", "roc_auc", "pr_auc", "precision", "recall", "reduction"):
        vals = [r[k] for r in runs]
        out[k] = round(float(np.mean(vals)), 4)
        out[k + "_std"] = round(float(np.std(vals)), 4)
    out["n_clusters"] = int(np.median([r["n_clusters"] for r in runs]))
    return out


def main():
    print("=" * 70, flush=True)
    print("  LODO (généralisation) + Ablation sans rule.id", flush=True)
    print("=" * 70, flush=True)

    log("Chargement du dataset…")
    X, y, raw, meta = load_real_v2()
    src = np.array([r["source"] for r in raw])
    sources = sorted(set(src.tolist()))
    log(f"  {len(y)} alertes, sources={sources}, FP rate {np.mean(y):.1%}")

    idx_by_src = {s: np.where(src == s)[0] for s in sources}
    for s in sources:
        ix = idx_by_src[s]
        log(f"  {s}: {len(ix)} alertes, FP {np.mean(y[ix]):.1%}")

    a, b = sources[0], sources[1]  # owasp_bench, juliet
    ia, ib = idx_by_src[a], idx_by_src[b]

    def split_in(idx, seed=42):
        """50/50 stratified split within one source for the in-distribution diagonal."""
        rng = np.random.RandomState(seed)
        tr, te = [], []
        ysub = y[idx]
        for cls in (0, 1):
            c = idx[ysub == cls]; rng.shuffle(c)
            half = len(c) // 2
            tr.extend(c[:half].tolist()); te.extend(c[half:].tolist())
        return np.array(tr), np.array(te)

    tr_a, te_a = split_in(ia)
    tr_b, te_b = split_in(ib)

    # ---- Build the 2x2 LODO matrix (source feature OFF everywhere here) ----
    log("")
    log("=== EXP A : MATRICE DE GÉNÉRALISATION (LODO) ===")
    log("    (source neutralisée ; seuil choisi sur le train ; 3 graines)")
    matrix = {}
    cells = [
        (f"{a}->{a}", tr_a, te_a, "in-distribution"),
        (f"{a}->{b}", ia, ib, "cross-dataset"),
        (f"{b}->{b}", tr_b, te_b, "in-distribution"),
        (f"{b}->{a}", ib, ia, "cross-dataset"),
    ]
    for name, tri, tei, kind in cells:
        r = avg_over_seeds(X, y, tri, tei, use_rule_id=True, use_source=False)
        matrix[name] = {**r, "kind": kind}
        log(f"  {name:<26s} [{kind:<15s}] F1={r['f1']:.3f}±{r['f1_std']:.3f}  "
            f"ROC={r['roc_auc']:.3f}  (train {r['n_train']}, test {r['n_test']})")

    in_f1 = np.mean([matrix[n]["f1"] for n, *_ in [(c[0],) for c in cells] if matrix[n]["kind"] == "in-distribution"])
    cross_f1 = np.mean([matrix[n]["f1"] for n, *_ in [(c[0],) for c in cells] if matrix[n]["kind"] == "cross-dataset"])
    in_roc = np.mean([matrix[n]["roc_auc"] for n in matrix if matrix[n]["kind"] == "in-distribution"])
    cross_roc = np.mean([matrix[n]["roc_auc"] for n in matrix if matrix[n]["kind"] == "cross-dataset"])
    gap_f1 = round(float(in_f1 - cross_f1), 4)
    log(f"  → moyenne in-distribution F1={in_f1:.3f} ROC={in_roc:.3f}")
    log(f"  → moyenne cross-dataset   F1={cross_f1:.3f} ROC={cross_roc:.3f}")
    log(f"  → GAP de généralisation : ΔF1={gap_f1:+.3f}  ΔROC={in_roc-cross_roc:+.3f}")

    # ---- Ablation sans rule.id (pooled in-distribution + each LODO cell) ----
    log("")
    log("=== EXP B : ABLATION SANS rule.id ===")
    log("    (on neutralise rule.id ; si le F1 tient → pas une table de correspondance)")

    # Pooled in-distribution reference (stratified 50/50 of the whole dataset)
    all_idx = np.arange(len(y))
    rng = np.random.RandomState(42)
    tr_all, te_all = [], []
    for cls in (0, 1):
        c = all_idx[y == cls]; rng.shuffle(c)
        half = len(c) // 2
        tr_all.extend(c[:half].tolist()); te_all.extend(c[half:].tolist())
    tr_all, te_all = np.array(tr_all), np.array(te_all)

    pooled_with = avg_over_seeds(X, y, tr_all, te_all, use_rule_id=True, use_source=True)
    pooled_without = avg_over_seeds(X, y, tr_all, te_all, use_rule_id=False, use_source=True)
    d_pool = round(pooled_with["f1"] - pooled_without["f1"], 4)
    log(f"  POOLED in-distribution  avec rule.id : F1={pooled_with['f1']:.3f} ROC={pooled_with['roc_auc']:.3f}")
    log(f"  POOLED in-distribution  SANS rule.id : F1={pooled_without['f1']:.3f} ROC={pooled_without['roc_auc']:.3f}")
    log(f"  → chute due à rule.id : ΔF1={d_pool:+.3f}")

    ablation_cells = {}
    for name, tri, tei, kind in cells:
        r = avg_over_seeds(X, y, tri, tei, use_rule_id=False, use_source=False)
        with_r = matrix[name]
        delta = round(with_r["f1"] - r["f1"], 4)
        ablation_cells[name] = {"with_rule": with_r["f1"], "without_rule": r["f1"],
                                 "delta_f1": delta, "roc_without": r["roc_auc"], "kind": kind}
        log(f"  {name:<26s} avec={with_r['f1']:.3f}  sans={r['f1']:.3f}  ΔF1={delta:+.3f}")

    # ---- Verdicts ----
    log("")
    log("=" * 70)
    log("LECTURE")
    generalizes = gap_f1 < 0.10
    not_lookup = pooled_without["f1"] >= 0.65
    log(f"  Généralisation : gap in↔cross ΔF1={gap_f1:+.3f} → "
        f"{'ROBUSTE (gap faible)' if generalizes else 'FRAGILE (gap important)'}")
    log(f"  Table de correspondance ? SANS rule.id F1={pooled_without['f1']:.3f} → "
        f"{'NON, le modèle tient' if not_lookup else 'le modèle dépend fortement de rule.id'}")
    log("=" * 70)

    out = {
        "config": {"seeds": SEEDS, "eps": EPS, "min_pts": MIN_PTS,
                   "n_estimators": N_TREES, "max_depth": MAX_DEPTH,
                   "sources": sources,
                   "note_source_off": "feature 'source' neutralisée dans toutes les cellules LODO",
                   "note_threshold": "seuil choisi sur un VAL interne au train (pas de fuite)"},
        "lodo_matrix": matrix,
        "lodo_summary": {"in_distribution_f1": round(float(in_f1), 4),
                          "cross_dataset_f1": round(float(cross_f1), 4),
                          "in_distribution_roc": round(float(in_roc), 4),
                          "cross_dataset_roc": round(float(cross_roc), 4),
                          "gap_f1": gap_f1, "generalizes": bool(generalizes)},
        "ablation": {"pooled_with_rule": pooled_with, "pooled_without_rule": pooled_without,
                      "pooled_delta_f1": d_pool, "per_cell": ablation_cells,
                      "not_a_lookup_table": bool(not_lookup)},
    }
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, "lodo_ablation_results.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    # mirror to the UI public dir so the frontend can read it server-side
    try:
        os.makedirs(UI_DATA, exist_ok=True)
        with open(os.path.join(UI_DATA, "lodo_ablation_results.json"), "w") as f:
            json.dump(out, f, indent=2)
    except Exception as e:
        log(f"  (mirror UI échoué: {e})")
    log(f"Saved → {out_path}")
    # Machine-readable line for the wizard UI
    print("RESULT: " + json.dumps({
        "in_f1": round(float(in_f1), 3), "cross_f1": round(float(cross_f1), 3),
        "gap_f1": gap_f1, "pooled_with": pooled_with["f1"],
        "pooled_without": pooled_without["f1"], "delta_rule": d_pool,
        "generalizes": bool(generalizes), "not_lookup": bool(not_lookup),
    }), flush=True)


if __name__ == "__main__":
    main()
