# AlertOptimizer — Rattrapage

Re-validation complète du système sur **données réelles**, en réponse aux trois critiques du jury sur le dataset synthétique. Tout le protocole du mémoire (EXP 1→8 + hypothèses H1, H2, H3) est rejoué sur **66 227 alertes labellisées** par des tiers, jamais par l'auteur.

## Dataset

| Source | Type | Apport |
|---|---|---|
| **OWASP Benchmark Java v1.2** | suite de test vulnérabilités web | labels TP/FP par construction du framework |
| **NIST Juliet Test Suite for Java v1.3** | SARD, ~49 k fichiers | volume + diversité de CWE |
| **Semgrep OSS** (multi-rulesets) | scanner SAST | génère les alertes au format SARIF |

➡️ **66 227 alertes**, **58 règles**, ~67,8 % de faux positifs. Les labels viennent des frameworks de test, ce qui élimine la circularité reprochée au dataset synthétique.

## Résultats de référence

| Métrique | Synthétique | **Réel** |
|---|---|---|
| F1-Score | 0,801 | **0,874** |
| ROC-AUC | 0,868 | **0,966** |
| Réduction du volume | 44 % | **69 %** |
| Rappel (vraies vulns préservées) | 86 % | **86 %** |
| Importance de `rule.id` | 81,7 % | **49,1 %** |
| Stabilité σ(F1) sur 5 seeds | 0,019 | **0,002** |

### Réponses aux 3 critiques

1. **Circularité du synthétique** → labels indépendants (OWASP + Juliet).
2. **`rule.id` = table de correspondance (81,7 %)** → tombe à **49,1 %** ; le modèle exploite le contexte.
3. **`GROUP BY rule_id` suffirait** → le pipeline le **bat de +11,4 pts F1** (0,874 vs 0,760) sur 66 k alertes.

### Verdicts

| Hypothèse | Critère | Réel | Verdict |
|---|---|---|---|
| **H1** | Réduction > 50 % ET rappel ≥ 85 % | 69 % / 86 % | **VALIDÉE ✓** |
| **H2** | ΔF1(DBSCAN) ≥ 5 pts | +2,9 pts | NON VALIDÉE ✗ |
| **H3** | ΔF1(AL, 5 cycles) ≥ 3 % | +1,0 pt | NON VALIDÉE ✗ |

Analyse complète : **[`addendum/Addendum_AlertOptimizer.md`](addendum/Addendum_AlertOptimizer.md)**.

## Structure

```
rattrapage/
├── README.md                  ← vous êtes ici
├── addendum/
│   ├── Addendum_AlertOptimizer.md   ← rapport complet (EXP 1-8 + H1/H2/H3)
│   └── Slides_outline.md            ← plan de présentation
├── scripts/                   ← construction du dataset + expériences (NumPy)
│   ├── build_dataset_owasp_enriched.py
│   ├── build_dataset_juliet.py
│   ├── build_labels.py
│   ├── merge_datasets.py
│   ├── full_experiment_real.py      ← EXP 1-8 sur données réelles
│   ├── grid_search.py               ← grid search DBSCAN + RF
│   ├── fast_helpers.py              ← DBSCAN/RF optimisés CPU/RAM
│   ├── build_per_rule_summary.py
│   └── cache_workbench_state.py     ← prépare l'état lu par l'UI
├── results/                   ← SARIF, datasets joints, CSV de résultats
├── data/                      ← sources OWASP/Juliet (git-ignorées, re-téléchargées)
└── ui/                        ← wizard de soutenance (voir ../QUICKSTART.md)
```

> Les gros artefacts (`data/`, SARIF bruts, CSV de dataset) sont **git-ignorés** car régénérables. Voir `.gitignore` à la racine. Les CSV de résultats légers (`hyperparam_*.csv`, `hyperparam_summary.md`) sont, eux, versionnés.

## Reproductibilité

Tout se rejoue depuis le **wizard UI**, qui télécharge les sources, scanne, construit le dataset et lance chaque expérience en direct. Démarrage : **[../QUICKSTART.md](../QUICKSTART.md)** (section B).

Pour rejouer une expérience seule en ligne de commande (venv activé à la racine) :

```bash
python rattrapage/scripts/full_experiment_real.py   # EXP 1-8
python rattrapage/scripts/grid_search.py            # grid search hyperparams
```
