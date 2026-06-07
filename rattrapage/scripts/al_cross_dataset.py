#!/usr/bin/env python3
"""
Apprentissage actif CROSS-DATASET — la boucle qui justifie le design.

L'atelier LODO a montré que le modèle ne transfère pas en zéro-shot d'un
benchmark à l'autre (les FP SAST sont spécifiques au projet). C'est
exactement le problème que l'apprentissage actif est censé résoudre :
dans un nouvel environnement, on n'espère pas du zéro-shot — on s'adapte
avec quelques labels bien choisis.

Protocole, pour chaque direction A → B :
  1. Entraîner le modèle sur TOUT le dataset source A.
  2. C0 (zéro-shot) : évaluer ce modèle A sur le test du dataset cible B.
  3. Boucle AL : à chaque cycle, requêter les N alertes les plus INCERTAINES
     du pool de B, récupérer leurs vrais labels (oracle), les ajouter au
     train, ré-entraîner, ré-évaluer sur le test de B.
  4. Comparaisons : échantillonnage ALÉATOIRE (même budget) + borne haute
     in-distribution (modèle entraîné directement sur le pool de B).

Métrique de tête : % du gap zéro-shot → borne haute récupéré par l'AL.

Rigueur : seuil choisi sur un VAL interne au train (pas de fuite test),
feature `source` neutralisée (constante par domaine), 1 graine principale
(le coût est dans les ré-entraînements ; la variance est documentée par
ailleurs dans EXP6).
"""
from __future__ import annotations

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
    metrics, roc_auc, find_threshold,
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
DBSCAN_COLS = [0, 1, 2, 3]
COL_SOURCE = 2
CYCLES = 6
FEEDBACK = 150
POOL_RATIO = 0.60  # of target B used as the AL pool; the rest is held-out test
SOURCE_CAP = 8000  # cap the source training set (symmetry between directions + speed)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _strat_val_split(y, seed, val_ratio=0.2):
    rng = np.random.RandomState(seed)
    fit, val = [], []
    for cls in (0, 1):
        idx = np.where(y == cls)[0]
        rng.shuffle(idx)
        n_val = max(1, int(val_ratio * len(idx)))
        val.extend(idx[:n_val].tolist())
        fit.extend(idx[n_val:].tolist())
    return np.array(fit), np.array(val)


def _enrich(X_tr, y_tr, evals, seed):
    """DBSCAN on a subsample of the current train; enrich train + each eval set."""
    db_idx = stratified_subsample(np.arange(len(y_tr)), y_tr, DBSCAN_MAX_LABELED, seed=seed)
    Xdb = X_tr[db_idx][:, DBSCAN_COLS]; ydb = y_tr[db_idx]
    cl_db = chunked_dbscan(Xdb, eps=EPS, min_pts=MIN_PTS)
    n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
    cl_tr, _ = assign_test_clusters(X_tr[:, DBSCAN_COLS], Xdb, cl_db, EPS)
    _, cmap = enrich_clusters(Xdb, cl_db, ydb, n_cl, is_train=True)
    Xtr_f, _ = enrich_clusters(X_tr, cl_tr, y_tr, n_cl, is_train=False, cl_fp_map=cmap)
    outs = []
    for Xe in evals:
        cle, _ = assign_test_clusters(Xe[:, DBSCAN_COLS], Xdb, cl_db, EPS)
        Xe_f, _ = enrich_clusters(Xe, cle, np.zeros(len(Xe), dtype=int), n_cl,
                                  is_train=False, cl_fp_map=cmap)
        outs.append(Xe_f)
    return Xtr_f, outs


def _fit_eval(X_tr, y_tr, X_te, y_te, seed, want_pool=None):
    """Train (on a fit split), pick threshold on val, score the test.
    Optionally return pool probabilities for uncertainty sampling."""
    evals = [X_te] + ([want_pool] if want_pool is not None else [])
    Xtr_f, enr = _enrich(X_tr, y_tr, evals, seed)
    Xte_f = enr[0]
    fit_i, val_i = _strat_val_split(y_tr, seed)
    rf = RandomForest(n_estimators=N_TREES, max_depth=MAX_DEPTH, random_state=seed)
    rf.fit(Xtr_f[fit_i], y_tr[fit_i])
    t = find_threshold(y_tr[val_i], rf.predict_proba(Xtr_f[val_i]), "f1",
                       min_recall=0.85, min_red=0.50)
    p_te = rf.predict_proba(Xte_f)
    m = metrics(y_te, p_te, t)
    res = {"f1": m["f1"], "recall": m["recall"], "reduction": m["reduction"],
           "roc_auc": roc_auc(y_te, p_te), "threshold": t, "n_train": int(len(y_tr))}
    pool_proba = rf.predict_proba(enr[1]) if want_pool is not None else None
    return res, pool_proba


def run_direction_seed(X_src, y_src, X_pool0, y_pool0, X_te, y_te, seed):
    """One seed: zero-shot, upper bound, and both AL curves (1 fit per cycle)."""
    zs, zs_pool = _fit_eval(X_src, y_src, X_te, y_te, seed, want_pool=X_pool0)
    ub, _ = _fit_eval(X_pool0, y_pool0, X_te, y_te, seed)

    def al_loop(strategy):
        X_tr = X_src.copy(); y_tr = y_src.copy()
        X_pool = X_pool0.copy(); y_pool = y_pool0.copy()
        p_pool = zs_pool  # from the zero-shot model
        rng = np.random.RandomState(seed + (7 if strategy == "random" else 0))
        curve = [{"cycle": 0, "n_labels": 0, "f1": zs["f1"], "roc_auc": zs["roc_auc"],
                  "recall": zs["recall"], "reduction": zs["reduction"]}]
        for c in range(1, CYCLES + 1):
            if len(y_pool) < FEEDBACK:
                break
            if strategy == "uncertainty":
                q = np.argsort(np.abs(p_pool - 0.5))[:FEEDBACK]
            else:
                q = rng.choice(len(y_pool), FEEDBACK, replace=False)
            X_tr = np.vstack([X_tr, X_pool[q]])
            y_tr = np.concatenate([y_tr, y_pool[q]])
            keep = np.ones(len(y_pool), dtype=bool); keep[q] = False
            X_pool, y_pool = X_pool[keep], y_pool[keep]
            res, p_pool = _fit_eval(X_tr, y_tr, X_te, y_te, seed, want_pool=X_pool)
            curve.append({"cycle": c, "n_labels": c * FEEDBACK, "f1": res["f1"],
                          "roc_auc": res["roc_auc"], "recall": res["recall"],
                          "reduction": res["reduction"]})
        return curve

    return {"zero_shot": zs, "upper_bound": ub,
            "uncertainty": al_loop("uncertainty"), "random": al_loop("random")}


def _avg_curves(curves):
    """Average a list of per-seed curves (same length) point by point."""
    n = min(len(c) for c in curves)
    out = []
    for i in range(n):
        f1s = [c[i]["f1"] for c in curves]
        rocs = [c[i]["roc_auc"] for c in curves]
        out.append({"cycle": curves[0][i]["cycle"], "n_labels": curves[0][i]["n_labels"],
                    "f1": round(float(np.mean(f1s)), 4), "f1_std": round(float(np.std(f1s)), 4),
                    "roc_auc": round(float(np.mean(rocs)), 4)})
    return out


def run_direction(name, X_src, y_src, X_pool0, y_pool0, X_te, y_te):
    log(f"  ── Direction {name} : source(cap)={len(y_src)}, pool={len(y_pool0)}, test={len(y_te)}")
    per_seed = []
    for s in SEEDS:
        per_seed.append(run_direction_seed(X_src, y_src, X_pool0, y_pool0, X_te, y_te, s))
        last = per_seed[-1]
        log(f"    seed {s}: zéro-shot F1={last['zero_shot']['f1']:.3f} → "
            f"unc {last['uncertainty'][-1]['f1']:.3f} / rnd {last['random'][-1]['f1']:.3f} "
            f"(plafond {last['upper_bound']['f1']:.3f})")

    zs_f1 = round(float(np.mean([p["zero_shot"]["f1"] for p in per_seed])), 4)
    zs_roc = round(float(np.mean([p["zero_shot"]["roc_auc"] for p in per_seed])), 4)
    ub_f1 = round(float(np.mean([p["upper_bound"]["f1"] for p in per_seed])), 4)
    ub_roc = round(float(np.mean([p["upper_bound"]["roc_auc"] for p in per_seed])), 4)
    unc = _avg_curves([p["uncertainty"] for p in per_seed])
    rnd = _avg_curves([p["random"] for p in per_seed])

    gap = ub_f1 - zs_f1
    rec_unc = round(float((unc[-1]["f1"] - zs_f1) / gap), 4) if abs(gap) > 1e-6 else 0.0
    rec_rnd = round(float((rnd[-1]["f1"] - zs_f1) / gap), 4) if abs(gap) > 1e-6 else 0.0
    log(f"    → moyenne {len(SEEDS)} graines : uncertainty récupère {rec_unc:.0%}, "
        f"random récupère {rec_rnd:.0%} du gap (plafond {ub_f1:.3f})")
    return {
        "zero_shot": {"f1": zs_f1, "roc_auc": zs_roc},
        "upper_bound": {"f1": ub_f1, "roc_auc": ub_roc},
        "uncertainty": unc, "random": rnd,
        "gap": round(gap, 4),
        "recovered_uncertainty": rec_unc, "recovered_random": rec_rnd,
        "final_uncertainty_f1": unc[-1]["f1"], "final_random_f1": rnd[-1]["f1"],
        "random_beats_uncertainty": bool(rnd[-1]["f1"] > unc[-1]["f1"]),
    }


def main():
    print("=" * 70, flush=True)
    print("  Apprentissage actif CROSS-DATASET (adaptation à un nouveau dataset)", flush=True)
    print("=" * 70, flush=True)

    log("Chargement du dataset…")
    X, y, raw, meta = load_real_v2()
    src = np.array([r["source"] for r in raw])
    # neutralise source feature everywhere (cross-domain)
    X = X.copy(); X[:, COL_SOURCE] = 0.0
    sources = sorted(set(src.tolist()))
    log(f"  {len(y)} alertes, sources={sources}")

    idx_by_src = {s: np.where(src == s)[0] for s in sources}

    def pool_test_split(idx, seed=42):
        rng = np.random.RandomState(seed)
        pool, test = [], []
        ys = y[idx]
        for cls in (0, 1):
            c = idx[ys == cls]; rng.shuffle(c)
            n_pool = int(POOL_RATIO * len(c))
            pool.extend(c[:n_pool].tolist()); test.extend(c[n_pool:].tolist())
        return np.array(pool), np.array(test)

    a, b = sources[0], sources[1]
    directions = {}
    log("")
    for src_name, tgt_name in [(b, a), (a, b)]:  # juliet->owasp, owasp->juliet
        src_idx = idx_by_src[src_name]
        # cap the source training set (symmetry + speed) — indices into the global y
        src_idx = stratified_subsample(src_idx, y, SOURCE_CAP, seed=42)
        pool_idx, test_idx = pool_test_split(idx_by_src[tgt_name])
        name = f"{src_name}->{tgt_name}"
        directions[name] = run_direction(
            name,
            X[src_idx], y[src_idx],
            X[pool_idx], y[pool_idx],
            X[test_idx], y[test_idx],
        )
        log("")

    out = {
        "config": {"seeds": SEEDS, "cycles": CYCLES, "feedback_per_cycle": FEEDBACK,
                   "pool_ratio": POOL_RATIO, "source_cap": SOURCE_CAP, "sources": sources,
                   "note": "source neutralisée ; seuil choisi sur le train ; source plafonnée "
                           f"à {SOURCE_CAP} (symétrie) ; courbes moyennées sur {len(SEEDS)} graines"},
        "directions": directions,
    }
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, "al_cross_dataset_results.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    try:
        os.makedirs(UI_DATA, exist_ok=True)
        with open(os.path.join(UI_DATA, "al_cross_dataset_results.json"), "w") as f:
            json.dump(out, f, indent=2)
    except Exception as e:
        log(f"  (mirror UI échoué: {e})")
    log("=" * 70)
    for name, d in directions.items():
        log(f"  {name:<26s} zéro-shot {d['zero_shot']['f1']:.3f} → unc {d['final_uncertainty_f1']:.3f} "
            f"/ rnd {d['final_random_f1']:.3f} (plafond {d['upper_bound']['f1']:.3f}) — "
            f"récupère unc {d['recovered_uncertainty']:.0%} / rnd {d['recovered_random']:.0%}")
    log("=" * 70)
    log(f"Saved → {out_path}")
    print("RESULT: " + json.dumps({
        "directions": {k: {"zero_shot": d["zero_shot"]["f1"],
                            "final_uncertainty": d["final_uncertainty_f1"],
                            "final_random": d["final_random_f1"],
                            "upper": d["upper_bound"]["f1"],
                            "recovered_uncertainty": d["recovered_uncertainty"],
                            "recovered_random": d["recovered_random"]}
                       for k, d in directions.items()},
    }), flush=True)


if __name__ == "__main__":
    main()
