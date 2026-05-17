# AlertOptimizer — Run Summary

- Seed: 42
- Alerts: 5000 (test set: 2502)
- True FP rate: 51.36%
- DBSCAN clusters: 41  (noise: 7.4%)
- Optimal threshold: 0.59

## Main metrics (test set)
- F1: 0.801
- Precision: 0.749
- Recall (FP): 0.861
- Reduction: 44.0%
- ROC-AUC: 0.868
- PR-AUC: 0.852

## Baselines (F1)
- B0 (keep all): 0.654
- B1 (static rules): 0.583
- B2 (RF only): 0.817
- B3 (DBSCAN only): 0.668

## Hypotheses
- H1 (Réd>50% & Rap≥85%): NOT VALIDATED
- H2 (ΔF1 DBSCAN ≥ 0.05): NOT VALIDATED
- H3 perfect AL (ΔF1 ≥ 0.03): VALIDATED
- H3 noisy AL (ΔF1 ≥ 0.03): NOT VALIDATED

## Generated artifacts
- `synthetic_dataset.sarif.json` — full 5000-alert dataset in SARIF v2.1.0
- `synthetic_dataset.csv` — same dataset, tabular
- `predictions_test.csv` — per-alert predictions on test set
- `predictions_test.sarif.json` — test alerts augmented with model output
- `clusters.csv` — DBSCAN cluster sizes and FP rates
- `feature_importance.csv` — permutation importance
- `threshold_sweep.csv` — metrics at every threshold
- `active_learning.csv` — AL trajectories (perfect vs noisy)
- `seeds.csv` — per-seed metrics
- `fp_sensitivity.csv` — metrics across target FP rates
- `summary.md` — this file
