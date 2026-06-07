# AlertOptimizer

**Pipeline de filtrage intelligent des faux positifs SAST (DBSCAN + Random Forest, NumPy pur)**

> Projet de mémoire de Master 2 — École IT Brussels / Hexagone
> Auteur : MABOU KOUAM Karl

---

## ⚡ TL;DR

Les outils SAST génèrent **35 % à 91 % de faux positifs** (Muske & Serebrenik, 2016), ce qui provoque l'*alert fatigue*. AlertOptimizer apprend à filtrer ces faux positifs tout en préservant les vraies vulnérabilités, avec un pipeline ML implémenté **entièrement en NumPy** (zéro dépendance sklearn).

Le projet existe en **deux temps** :

| | Mémoire initial | Rattrapage *(résultats de référence)* |
|---|---|---|
| **Dataset** | 5 000 alertes synthétiques | **66 227 alertes réelles** (OWASP Benchmark + NIST Juliet, scan Semgrep) |
| **Labels** | générés par l'auteur | fournis par des tiers (frameworks de test) |
| **F1-Score** | 0,801 | **0,874** |
| **ROC-AUC** | 0,868 | **0,966** |
| **Réduction du volume** | 44 % | **69 %** (à 86 % de rappel) |
| **Importance de `rule.id`** | 81,7 % | **49,1 %** |
| **H1 (réduction + rappel)** | partielle | **VALIDÉE ✓** |

> 👉 **Les résultats de référence du projet sont ceux du rattrapage** (`rattrapage/`). Le pipeline synthétique décrit plus bas est conservé pour l'historique et la reproductibilité.

**Pour démarrer :** voir **[QUICKSTART.md](QUICKSTART.md)** — clone → backend → frontend → wizard 10 étapes.

---

## Pourquoi un rattrapage ?

La soutenance initiale a été recalée sur trois critiques du jury :

1. **Dataset synthétique** → le modèle « redécouvre » des patterns qu'on lui a programmés (circularité).
2. **`rule.id` à 81,7 % de l'importance** → effet table de correspondance, pas de vrai apprentissage.
3. **Un simple `GROUP BY rule_id` suffirait** → plus-value du ML non démontrée.

Le dossier **[`rattrapage/`](rattrapage/)** répond expérimentalement à chacune, en re-rejouant **l'intégralité du protocole (EXP 1→8 + H1/H2/H3)** sur des données réelles aux labels indépendants. Réponses mesurées :

1. **Données réelles** (OWASP Benchmark Java v1.2 + NIST Juliet v1.3, 66 227 alertes labellisées par les frameworks eux-mêmes).
2. **`rule.id` tombe à 49,1 %** — le modèle exploite désormais le contexte, pas un dictionnaire de règles.
3. **Le pipeline bat `GROUP BY rule_id` de +11,4 pts F1** (0,874 vs 0,760) sur 66 k alertes : le ML s'impose sans ambiguïté.

Détails complets : **[`rattrapage/addendum/Addendum_AlertOptimizer.md`](rattrapage/addendum/Addendum_AlertOptimizer.md)**.

### Verdicts sur données réelles

| Hypothèse | Critère | Synthétique | Réel | Verdict |
|---|---|---|---|---|
| **H1** | Réduction > 50 % ET rappel ≥ 85 % | 44 % / 86 % | **69 % / 86 %** | **VALIDÉE ✓** |
| **H2** | ΔF1 apporté par DBSCAN ≥ 5 pts | −1,6 pts | +2,9 pts | NON VALIDÉE ✗ |
| **H3** | ΔF1 après 5 cycles d'apprentissage actif ≥ 3 % | +3,1 pts | +1,0 pt | NON VALIDÉE ✗ |

> H2 et H3 restent non validées, mais pour des raisons que l'expérimentation éclaire (DBSCAN aide désormais au lieu de nuire ; l'AL plafonne parce que le modèle démarre déjà très haut). Stabilité sur 5 seeds : **σ(F1) = 0,002** sur réel (÷10 vs synthétique).

---

## Architecture du pipeline

```
Alertes SARIF v2.1.0 (JSON)
        │
        ▼
[Module 1] Ingestion SARIF ──────────────▶ 8 features normalisées
        │
        ▼
[Module 2a] DBSCAN (densité) ────────────▶ clusters + 2 features dérivées
        │                                   (cluster_fp_rate, cluster_size)
        ▼
[Module 2b] Random Forest (NumPy pur) ───▶ P(faux positif) par alerte
        │
        ▼
[Module 3] Apprentissage actif ──────────▶ uncertainty sampling (5 cycles)
        │
        ▼
SARIF augmenté + scores FP
```

| Composant | Choix | Justification |
|---|---|---|
| Clustering | **DBSCAN** | trouve le nombre de clusters tout seul, détecte le bruit, pas de `k` à fixer |
| Classification | **Random Forest** | interprétable, probabilités calibrées, robuste au surapprentissage |
| Apprentissage actif | **Uncertainty sampling** | simple, s'intègre aux probabilités du RF |
| Implémentation | **NumPy pur** | auditabilité totale, sécurité supply-chain, portabilité |
| Format d'entrée | **SARIF v2.1.0** | standard OASIS, agnostique de l'outil SAST |

Algorithmes implémentés from scratch : DBSCAN (Ester et al., 1996), Random Forest (Breiman, 2001), Active Learning (Settles, 2009).

---

## Structure du dépôt

```
AlertOptimizer/
├── README.md                  ← vous êtes ici
├── QUICKSTART.md              ← démarrage pas à pas (rattrapage + UI)
├── LICENSE                    ← MIT
├── requirements.txt           ← dépendances du pipeline synthétique (numpy)
├── alertoptimizer.py          ← mémoire initial : pipeline synthétique complet
│
└── rattrapage/                ← RÉSULTATS DE RÉFÉRENCE (données réelles)
    ├── README.md              ← détail du protocole rattrapage
    ├── addendum/              ← Addendum_AlertOptimizer.md + plan de slides
    ├── scripts/               ← construction dataset + expériences + grid search
    ├── results/               ← datasets joints, SARIF, CSV de résultats
    ├── data/                  ← sources OWASP/Juliet (re-téléchargées, git-ignorées)
    └── ui/                    ← wizard de soutenance (Next.js + FastAPI)
        ├── backend/           ← FastAPI : rejoue chaque étape en flux SSE
        └── frontend/          ← assistant interactif en 10 étapes
```

---

## Exécution rapide (mémoire synthétique)

```bash
git clone https://github.com/karlmabs/AlertOptimizer.git
cd AlertOptimizer
pip install -r requirements.txt
python alertoptimizer.py        # rejoue les 8 expériences synthétiques
```

Résultats écrits dans `alertoptimizer_results.json`.

## Exécution complète (rattrapage sur données réelles)

Tout est rejouable depuis le **wizard UI** (qui télécharge les sources, scanne, construit le dataset, lance la grid search puis le pipeline). Voir **[QUICKSTART.md](QUICKSTART.md)**.

---

## Références

- Breiman, L. (2001). Random Forests. *Machine Learning*, 45(1), 5-32.
- Ester, M. et al. (1996). A Density-Based Algorithm for Discovering Clusters. *KDD*.
- Settles, B. (2009). Active Learning Literature Survey. *UW-Madison TR 1648*.
- Muske, T. & Serebrenik, A. (2016). Survey of Approaches for Handling Static Analysis Alarms. *SCAM*.
- OASIS (2020). Static Analysis Results Interchange Format (SARIF) v2.1.0.
- OWASP Benchmark Project ; NIST Juliet Test Suite for Java (SARD).

## Licence

MIT — voir [LICENSE](LICENSE).
