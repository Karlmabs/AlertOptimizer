#!/usr/bin/env python3
"""
Significativité statistique de l'écart Pipeline vs GROUP BY.

Le mémoire annonce « +11,4 pts F1 ». C'est une valeur ponctuelle. Cet atelier
la blinde avec deux tests classiques, tout en NumPy (aucune dépendance) :

1. TEST DE McNEMAR (appariation) — sur le même test set, on compare la
   justesse alerte par alerte des deux méthodes. b = pipeline a raison /
   GROUP BY a tort ; c = l'inverse. χ² = (|b−c|−1)² / (b+c) (correction de
   continuité), p-value à 1 degré de liberté. Répond à : « le pipeline est-il
   significativement meilleur, ou est-ce du bruit ? »

2. INTERVALLES DE CONFIANCE BOOTSTRAP — on ré-échantillonne le test set
   (avec remise, N fois) à seuils FIXÉS, et on regarde la distribution du
   F1 de chaque méthode et de leur écart. On rapporte l'IC à 95 %.

Le seuil de chaque méthode est fixé UNE fois (comme EXP1), puis gardé
constant pendant le bootstrap — on mesure la variabilité d'échantillonnage,
pas du re-tuning.
"""
from __future__ import annotations

import json
import math
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
    metrics, roc_auc, find_threshold,
)
from fast_helpers import chunked_dbscan, stratified_subsample, patch_random_forest  # noqa: E402
from full_experiment_real import (  # noqa: E402
    load_real_v2, stratified_split, baseline_groupby_rule,
)

patch_random_forest()

ROOT = os.path.join(THIS, "..")
RESULTS_DIR = os.path.join(ROOT, "results")
UI_DATA = os.path.normpath(os.path.join(THIS, "..", "ui", "frontend", "public", "data"))

SEED = 42
DBSCAN_MAX_LABELED = 1500
N_TREES = 50
MAX_DEPTH = 14
EPS = 0.25
MIN_PTS = 3
N_BOOT = 2000


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def f1_at(y_true, y_prob, t):
    return metrics(y_true, y_prob, t)["f1"]


def main():
    print("=" * 70, flush=True)
    print("  Significativité — Pipeline vs GROUP BY (McNemar + bootstrap)", flush=True)
    print("=" * 70, flush=True)

    log("Chargement + split (seed=42)…")
    X, y, raw, meta = load_real_v2()
    lab_idx, pool_idx, te_idx = stratified_split(y, seed=SEED)
    X_lab, y_lab = X[lab_idx], y[lab_idx]
    X_te, y_te = X[te_idx], y[te_idx]

    # ---- Pipeline (DBSCAN + RF), même protocole qu'EXP1 ----
    log("Entraînement du pipeline (DBSCAN + RF)…")
    db_idx = stratified_subsample(np.arange(len(lab_idx)), y_lab, DBSCAN_MAX_LABELED, seed=SEED)
    X_db = X_lab[db_idx][:, [0, 1, 2, 3]]
    y_db = y_lab[db_idx]
    cl_db = chunked_dbscan(X_db, eps=EPS, min_pts=MIN_PTS)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
    cl_lab, _ = assign_test_clusters(X_lab[:, [0, 1, 2, 3]], X_db, cl_db, EPS)
    cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, EPS)
    _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
    X_lab_f, _ = enrich_clusters(X_lab, cl_lab, y_lab, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    X_te_f, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)
    rf = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=SEED)
    rf.fit(X_lab_f, y_lab)
    p_pipe = rf.predict_proba(X_te_f)

    # ---- GROUP BY rule_id ----
    log("Baseline GROUP BY rule_id…")
    p_gb = baseline_groupby_rule(X_lab_f, y_lab, X_te_f)

    # ---- Seuils fixés une fois (comme EXP1) ----
    t_pipe = find_threshold(y_te, p_pipe, "f1", min_recall=0.85, min_red=0.50)
    t_gb = find_threshold(y_te, p_gb, "f1")
    f1_pipe = f1_at(y_te, p_pipe, t_pipe)
    f1_gb = f1_at(y_te, p_gb, t_gb)
    gap = f1_pipe - f1_gb
    log(f"  Pipeline F1={f1_pipe:.4f} (seuil {t_pipe}) · GROUP BY F1={f1_gb:.4f} (seuil {t_gb})")
    log(f"  Écart ponctuel ΔF1 = {gap:+.4f} ({gap*100:+.1f} pts)")

    # ---- McNemar (sur la justesse des prédictions) ----
    pred_pipe = (p_pipe >= t_pipe).astype(int)
    pred_gb = (p_gb >= t_gb).astype(int)
    correct_pipe = pred_pipe == y_te
    correct_gb = pred_gb == y_te
    b = int(np.sum(correct_pipe & ~correct_gb))   # pipeline a raison, GROUP BY a tort
    c = int(np.sum(~correct_pipe & correct_gb))   # l'inverse
    n_disc = b + c
    if n_disc > 0:
        chi2 = (abs(b - c) - 1) ** 2 / n_disc      # correction de continuité
        # p-value, loi du chi² à 1 ddl : p = erfc( sqrt(chi2/2) )
        p_value = math.erfc(math.sqrt(chi2 / 2.0))
    else:
        chi2, p_value = 0.0, 1.0
    log(f"  McNemar : b={b} (pipeline gagne) / c={c} (GROUP BY gagne) · "
        f"χ²={chi2:.1f} · p={p_value:.2e}")

    # ---- Bootstrap IC95 % (seuils fixés) ----
    log(f"Bootstrap {N_BOOT} ré-échantillonnages…")
    rng = np.random.RandomState(SEED)
    n = len(y_te)
    boot_pipe, boot_gb, boot_gap = [], [], []
    y_te_arr = np.asarray(y_te)
    for i in range(N_BOOT):
        idx = rng.randint(0, n, n)
        yb = y_te_arr[idx]
        fp = f1_at(yb, p_pipe[idx], t_pipe)
        fg = f1_at(yb, p_gb[idx], t_gb)
        boot_pipe.append(fp); boot_gb.append(fg); boot_gap.append(fp - fg)
        if (i + 1) % 500 == 0:
            log(f"  … {i+1}/{N_BOOT}")

    def ci(arr):
        a = np.sort(np.asarray(arr))
        return float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))

    pipe_lo, pipe_hi = ci(boot_pipe)
    gb_lo, gb_hi = ci(boot_gb)
    gap_lo, gap_hi = ci(boot_gap)
    log(f"  Pipeline F1 : {f1_pipe:.3f}  IC95 % [{pipe_lo:.3f} ; {pipe_hi:.3f}]")
    log(f"  GROUP BY F1 : {f1_gb:.3f}  IC95 % [{gb_lo:.3f} ; {gb_hi:.3f}]")
    log(f"  Écart ΔF1   : {gap:.3f}  IC95 % [{gap_lo:.3f} ; {gap_hi:.3f}]")

    significant = bool(p_value < 0.05 and gap_lo > 0)
    log("=" * 70)
    log(f"  VERDICT : écart {'SIGNIFICATIF' if significant else 'NON significatif'} "
        f"(p={p_value:.1e}, IC de l'écart {'exclut' if gap_lo > 0 else 'inclut'} 0)")
    log("=" * 70)

    out = {
        "config": {"seed": SEED, "n_test": int(n), "n_bootstrap": N_BOOT,
                   "threshold_pipeline": t_pipe, "threshold_groupby": t_gb},
        "f1_pipeline": round(f1_pipe, 4),
        "f1_groupby": round(f1_gb, 4),
        "gap": round(gap, 4),
        "gap_pts": round(gap * 100, 1),
        "ci_pipeline": [round(pipe_lo, 4), round(pipe_hi, 4)],
        "ci_groupby": [round(gb_lo, 4), round(gb_hi, 4)],
        "ci_gap": [round(gap_lo, 4), round(gap_hi, 4)],
        "mcnemar": {"b": b, "c": c, "chi2": round(chi2, 2), "p_value": p_value},
        "significant": significant,
    }
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, "significance_results.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    try:
        os.makedirs(UI_DATA, exist_ok=True)
        with open(os.path.join(UI_DATA, "significance_results.json"), "w") as f:
            json.dump(out, f, indent=2)
    except Exception as e:
        log(f"  (mirror UI échoué: {e})")
    log(f"Saved → {out_path}")
    print("RESULT: " + json.dumps({
        "gap_pts": round(gap * 100, 1),
        "ci_gap": [round(gap_lo * 100, 1), round(gap_hi * 100, 1)],
        "p_value": p_value, "significant": significant,
        "f1_pipeline": round(f1_pipe, 3), "f1_groupby": round(f1_gb, 3),
    }), flush=True)


if __name__ == "__main__":
    main()
