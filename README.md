# AlertOptimizer

**Pipeline de filtrage intelligent des faux positifs SAST dans un contexte DevSecOps**

> Projet de memoire de Master 2 — Ecole IT Brussels / Hexagone  
> Auteur : MABOU KOUAM Karl

---

## Contexte

Les outils d'analyse statique de securite (SAST) generent un volume considerable d'alertes dont **35% a 91% sont des faux positifs** (Muske & Serebrenik, 2016). Ce phenomene d'**alert fatigue** pousse les developpeurs a ignorer progressivement toutes les alertes, y compris les vraies vulnerabilites.

AlertOptimizer propose un pipeline de Machine Learning pour **filtrer automatiquement les faux positifs** tout en preservant les vraies alertes de securite.

## Architecture

Le pipeline suit une architecture sequentielle en trois modules :

```
Alertes SARIF v2.1.0 (JSON)
        |
        v
[Module 1] Ingestion SARIF ──> 8 features normalisees
        |
        v
[Module 2a] DBSCAN Clustering ──> 41 clusters + 2 features derivees
        |
        v
[Module 2b] Random Forest (50 arbres, depth=14) ──> P(FP) par alerte
        |
        v
[Module 3] Apprentissage actif (uncertainty sampling)
        |
        v
Sortie : SARIF augmente + scores FP
```

### Choix techniques

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Clustering | DBSCAN | Decouvre automatiquement le nombre de clusters, detecte le bruit, pas besoin de fixer k |
| Classification | Random Forest | Interpretable, probabilites calibrees, robuste au surapprentissage, implementable from scratch |
| Apprentissage actif | Uncertainty sampling | Simple, efficace, s'integre naturellement avec les probabilites du RF |
| Implementation | NumPy pur (from scratch) | Auditabilite complete, securite de la chaine d'approvisionnement, portabilite |
| Format d'entree | SARIF v2.1.0 | Standard OASIS, agnostique de l'outil SAST |

## Resultats

### Performances globales

| Metrique | Valeur |
|----------|--------|
| F1-Score | **0.801** |
| ROC-AUC | **0.868** |
| PR-AUC | **0.852** |
| Precision | 0.749 |
| Rappel (FP) | 0.861 |
| Taux de reduction | 44.0% |

### Hypotheses

| Hypothese | Critere | Resultat | Verdict |
|-----------|---------|----------|---------|
| H1 | >50% reduction + >85% rappel | 44% + 86.1% | **Partielle** |
| H2 | +5 pts F1 avec DBSCAN | -1.6 pts | **Infirmee** |
| H3 (parfait) | +3% F1 apres 5 cycles AL | +3.1% | **Validee** |
| H3 (bruite) | +3% F1 apres 5 cycles AL | +2.7% | **Non validee** |

### Importance des features

```
 1. rule.id              81.7%
 2. cluster_fp_rate       6.7%
 3. level                 4.5%
 4. file_type             3.1%
 5. severity              1.8%
 6. rank                  1.2%
 7. cluster_size          0.5%
 8. tool                  0.3%
 9. start_line            0.1%
10. occurrenceCount       0.1%
```

### Stabilite (5 seeds)

F1-Score moyen : **0.793 +/- 0.019** (seeds: 42, 123, 256, 512, 1024)

## Installation et utilisation

### Prerequis

- Python 3.8+
- NumPy >= 1.21

### Installation

```bash
git clone https://github.com/karlmabs/AlertOptimizer.git
cd AlertOptimizer
pip install -r requirements.txt
```

### Execution

```bash
python alertoptimizer.py
```

Le script execute automatiquement 8 experiences :
1. Pipeline principal (DBSCAN + RF)
2. Importance des features par permutation
3. Apprentissage actif avec retour parfait
4. Apprentissage actif avec retour bruite (10%)
5. Sensibilite a la proportion de faux positifs
6. Stabilite inter-seeds (5 seeds)
7. Analyse des seuils de decision
8. Courbes ROC et PR

Les resultats sont sauvegardes dans `alertoptimizer_results.json`.

## Dataset

Le pipeline utilise un dataset synthetique de **5 000 alertes** au format SARIF v2.1.0 :

- **32 regles** reparties en 3 categories : 10 FP clairs, 10 VP clairs, 12 contextuels
- **Split** : 10% train / 40% pool / 50% test
- **Taux FP** : ~51.4% (moyenne ponderee)
- **5 seeds** independants pour la validation

### 10 Features

| # | Feature | Type | Source |
|---|---------|------|--------|
| 1 | rule.id | Categorielle | SARIF |
| 2 | level | Categorielle | SARIF |
| 3 | file_type | Categorielle | SARIF |
| 4 | tool.name | Categorielle | SARIF |
| 5 | start_line | Numerique | SARIF |
| 6 | rank | Numerique | SARIF |
| 7 | occurrenceCount | Numerique | SARIF |
| 8 | severity | Numerique | SARIF |
| 9 | cluster_fp_rate | Derivee | DBSCAN |
| 10 | cluster_size | Derivee | DBSCAN |

## Algorithmes implementes from scratch

### DBSCAN (Ester et al., 1996)
- Distance euclidienne normalisee sur 4 features contextuelles
- Parametres : epsilon = 0.25, MinPts = 3
- Resultat : 41 clusters, 7.4% bruit

### Random Forest (Breiman, 2001)
- 50 arbres, profondeur max 14
- Critere de split : impurete de Gini
- Bootstrap aggregating + feature randomization (sqrt)
- Class weighting balanced

### Apprentissage actif (Settles, 2009)
- Pool-based uncertainty sampling
- 5 cycles de 150 requetes
- Variante avec oracle bruite (10% erreur)

## Structure du code

```
AlertOptimizer/
  alertoptimizer.py      # Pipeline complet (dataset, DBSCAN, RF, AL, metriques)
  requirements.txt       # Dependances (NumPy uniquement)
  README.md
  LICENSE
```

Le fichier `alertoptimizer.py` contient 7 sections :
1. **Dataset** : Generation synthetique SARIF
2. **DBSCAN** : Clustering par densite
3. **Random Forest** : Classification (DecisionTree + RandomForest)
4. **Metriques** : F1, ROC-AUC, PR-AUC, seuil optimal
5. **Pipeline** : Orchestration DBSCAN -> RF + baselines
6. **Active Learning** : Boucle d'apprentissage actif
7. **Feature Importance** : Importance par permutation

## References

- Breiman, L. (2001). Random Forests. *Machine Learning*, 45(1), 5-32.
- Ester, M. et al. (1996). A Density-Based Algorithm for Discovering Clusters. *KDD*.
- Settles, B. (2009). Active Learning Literature Survey. *UW-Madison Tech Report 1648*.
- Muske, T. & Serebrenik, A. (2016). Survey of Approaches for Handling Static Analysis Alarms. *SCAM*.
- OASIS (2020). Static Analysis Results Interchange Format (SARIF) v2.1.0.

## Licence

MIT License - voir [LICENSE](LICENSE)
