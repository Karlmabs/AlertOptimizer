#!/usr/bin/env python3
"""
Décomposition par source : OWASP seul vs Juliet seul vs Combiné.

Répond à la question « le résultat n'est-il porté que par Juliet (88 % du volume) ? ».
On rejoue EXACTEMENT le même protocole qu'EXP1 (split stratifié, seuil choisi sur
une validation interne au train) séparément sur chaque source, et on compare le
pipeline au baseline GROUP BY rule_id. Moyenne ± écart-type sur 5 graines.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS)
from full_experiment_real import (  # noqa: E402
    load_real_v2, run_pipeline_seed, baselines_comparison, SEEDS,
)

RESULTS_DIR = os.path.join(THIS, "..", "results")


def mean_std(xs):
    a = np.asarray(xs, dtype=float)
    return float(a.mean()), float(a.std())


def main():
    print("=" * 70, flush=True)
    print("  Décomposition par source — OWASP / Juliet / Combiné", flush=True)
    print("=" * 70, flush=True)

    X, y, raw, meta = load_real_v2()
    n_rules = len(meta["rule_ids"])
    source = np.array([r["source"] for r in raw])

    subsets = [
        ("OWASP seul", source == "owasp_bench"),
        ("Juliet seul", source == "juliet"),
        ("Combiné", np.ones(len(y), dtype=bool)),
    ]

    table = []
    for name, mask in subsets:
        Xs, ys = X[mask], y[mask]
        n = int(mask.sum())
        fp_rate = float(ys.mean())
        n_rules_sub = len({raw[i]["rule_id"] for i in np.where(mask)[0]})
        pipe_f1, pipe_red, pipe_rec, gb_f1, gaps = [], [], [], [], []
        for seed in SEEDS:
            r = run_pipeline_seed(seed, Xs, ys, n_rules)
            bl = baselines_comparison(r)
            pf1 = r["metrics"]["f1"]
            gf1 = bl["b4_groupby_rule"]["metrics"]["f1"]
            pipe_f1.append(pf1)
            pipe_red.append(r["metrics"]["reduction"])
            pipe_rec.append(r["metrics"]["recall"])
            gb_f1.append(gf1)
            gaps.append(pf1 - gf1)
        pf1_m, pf1_s = mean_std(pipe_f1)
        gf1_m, gf1_s = mean_std(gb_f1)
        gap_m, gap_s = mean_std(gaps)
        red_m, _ = mean_std(pipe_red)
        rec_m, _ = mean_std(pipe_rec)
        row = {
            "source": name, "n_alerts": n, "n_rules": n_rules_sub,
            "fp_rate": round(fp_rate, 4),
            "pipeline_f1": round(pf1_m, 4), "pipeline_f1_std": round(pf1_s, 4),
            "pipeline_reduction": round(red_m, 4), "pipeline_recall": round(rec_m, 4),
            "groupby_f1": round(gf1_m, 4), "groupby_f1_std": round(gf1_s, 4),
            "gap_f1": round(gap_m, 4), "gap_f1_std": round(gap_s, 4),
            "gap_pts": round(gap_m * 100, 1),
        }
        table.append(row)
        print(f"\n{name}: n={n} ({n_rules_sub} règles, FP {fp_rate:.1%})", flush=True)
        print(f"  Pipeline F1 = {pf1_m:.3f} ± {pf1_s:.3f}  (Réd {red_m:.1%}, Rappel {rec_m:.3f})", flush=True)
        print(f"  GROUP BY F1 = {gf1_m:.3f} ± {gf1_s:.3f}", flush=True)
        print(f"  Écart ML    = {gap_m*100:+.1f} pts", flush=True)

    out_path = os.path.join(RESULTS_DIR, "per_source_results.json")
    with open(out_path, "w") as f:
        json.dump({"by_source": table, "seeds": SEEDS}, f, indent=2)
    print(f"\nSaved → {out_path}", flush=True)

    print("\n" + "=" * 70, flush=True)
    print(f"  {'Source':<14} {'n':>7} {'règles':>7} {'Pipeline F1':>14} {'GROUP BY F1':>14} {'Écart':>8}", flush=True)
    for r in table:
        print(f"  {r['source']:<14} {r['n_alerts']:>7} {r['n_rules']:>7} "
              f"{r['pipeline_f1']:.3f}±{r['pipeline_f1_std']:.3f}   "
              f"{r['groupby_f1']:.3f}±{r['groupby_f1_std']:.3f}   "
              f"{r['gap_pts']:>+5.1f}", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    main()
