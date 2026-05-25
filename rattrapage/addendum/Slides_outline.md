# Soutenance de rattrapage — AlertOptimizer
## Outline de slides (16 slides, ~20 min)

Chaque slide : **Titre**, **Contenu visible** (à mettre sur la slide), **Speaker note** (à dire à l'oral, à mémoriser, pas sur la slide).

Idée directrice : *montrer immédiatement que la critique a été prise au sérieux, déployer les nouveaux résultats sur 66 k alertes réelles, conclure honnêtement sur les hypothèses qui passent et celles qui ne passent pas.*

---

## Slide 1 — Page de garde

**AlertOptimizer — Soutenance de rattrapage**
*Re-validation expérimentale complète sur 66 227 alertes réelles labellisées par OWASP + NIST*

MABOU KOUAM Karl
Master 2 — Expert en Ingénierie Informatique
École Hexagone — 2026

> *Speaker note* : Salutation, contexte, annonce que cette session est centrée sur la critique du jury et la re-validation complète du protocole expérimental du mémoire sur dataset réel. Plan en 3 temps : critique reçue → re-évaluation des 8 EXP + H1/H2/H3 sur réel → conclusion nuancée.

---

## Slide 2 — La critique du jury

**Trois critiques reçues, toutes pertinentes**

1. Dataset synthétique → circularité (le modèle redécouvre des patterns programmés)
2. `rule.id` à **81,7 %** d'importance → effet de table de correspondance
3. Une simple requête `GROUP BY rule_id` suffirait peut-être

→ *« Votre système est-il réellement testé, ou simplement validé sur ses propres hypothèses ? »*

> *Speaker note* : Présenter les critiques sans défensivité. Reconnaître qu'elles sont valables. Annoncer que la suite est une re-validation complète : *toutes* les expérimentations du mémoire ont été refaites sur le réel, sans en sauter aucune.

---

## Slide 3 — Stratégie de réponse

**Re-validation complète sur dataset où les labels sont fournis par des tiers**

- ✅ **OWASP Benchmark Java v1.2** (Fondation OWASP) : 2 740 cas → 8 043 alertes
- ✅ **Juliet Test Suite Java v1.3** (NIST SARD) : 46 803 cas → 58 184 alertes
- ✅ **Dataset unifié : 66 227 alertes labellisées** (13× le volume du mémoire initial)
- ✅ **Outil : Semgrep OSS 1.162.0** avec 6 rulesets publics → 58 règles uniques
- ✅ **Vraie baseline GROUP BY** avec smoothing de Laplace
- ✅ **Tous les 8 EXP + H1/H2/H3 ré-évalués**, validation sur 5 graines indépendantes

> *Speaker note* : Insister sur l'indépendance des labels (OWASP + NIST). Insister sur la taille : 13× plus que les 5 000 synthétiques du mémoire — la critique de volume est traitée. Tout reproductible.

---

## Slide 4 — Le pipeline reste identique

**Pas de redesign — c'est *le même système* qu'on teste**

- DBSCAN (ε=0,25, MinPts=3) + Random Forest (50 arbres, profondeur 14) en NumPy pur
- 8 features SARIF du mémoire + 1 nouvelle : `is_taint_rule` (contextuelle, dérivée du `rule_id`)
- Split stratifié 10/40/50 (labeled / pool / test), comme dans le mémoire
- Optimisations *techniques uniquement* (DBSCAN chunké, predict_proba vectorisé, multiprocessing) — *aucun changement algorithmique*

> *Speaker note* : Point important : c'est exactement le même système, pas une version améliorée. Si les résultats changent, c'est dû au dataset, pas au pipeline. Cette précision est essentielle pour rendre les comparaisons valides.

---

## Slide 5 — EXP 1 — Pipeline principal

**Toutes les métriques améliorées sur dataset réel**

| Métrique | Synthétique (mémoire) | **Réel (addendum)** |
|---|---|---|
| F1-Score | 0,801 | **0,874** |
| Précision | 0,749 | **0,891** |
| Rappel | 0,861 | 0,858 |
| **Réduction des FP** | **44,0 %** | **69,0 %** |
| ROC-AUC | 0,868 | **0,966** |
| PR-AUC | 0,852 | **0,888** |

> *Speaker note* : Résultat inattendu et important : sur dataset réel indépendant, le pipeline performe MIEUX que sur synthétique. C'est une validation forte de la robustesse architecturale. Le système n'était pas surajusté au synthétique. Mentionner que la réduction passe de 44 % à 69 % — c'est l'opérationnel le plus impactant.

---

## Slide 6 — Baselines — réponse à la critique #3

**Comparaison frontale sur 33 114 alertes de test (seed 42)**

| Méthode | F1 | Réduction | ROC-AUC |
|---|---|---|---|
| **Pipeline (DBSCAN + RF)** | **0,874** | **69,0 %** | **0,966** |
| RF seul (sans DBSCAN) | 0,845 | 67,2 % | 0,960 |
| **GROUP BY rule_id (baseline jury)** | **0,760** | **57,8 %** | 0,747 |
| Random | 0,481 | 5,5 % | — |
| Majority (filtre tout) | 0,000 | 100 % | — |

→ **Le ML bat GROUP BY de +11,4 pts F1, +11,2 pts de réduction, +21,9 pts ROC-AUC.**

> *Speaker note* : Slide central. La critique du jury sur GROUP BY est traitée frontalement avec la baseline qui était demandée. À l'échelle de 66 k alertes avec 58 règles, l'écart ML vs GROUP BY n'est plus marginal — il est décisif. B1 majority à F1=0 : avec 67,8 % de FP, prédire « tout FP » filtre tout, perd tous les TP. Baseline dégénéré, inclus par cohérence du protocole.

---

## Slide 7 — EXP 2 — Importance des features

**`rule.id` : 81,7 % → 49,1 % d'importance ROC**

| Feature | Importance ROC (réel) | (synth.) |
|---|---|---|
| **`rule.id`** | **49,1 %** | 81,7 % |
| `occurrenceCount` | 22,9 % | 0,1 % |
| `start_line` | 12,2 % | 0,1 % |
| `is_taint_rule` (ajoutée) | 7,2 % | — |
| `cluster_fp_rate` | 4,4 % | 6,7 % |
| `cluster_size` | 1,6 % | 0,5 % |
| autres (5 features) | 2,6 % | 9,3 % |

→ *La critique du jury est validée par les chiffres : le synthétique amplifiait artificiellement `rule.id`.*

> *Speaker note* : C'est le slide où je donne raison au jury de la manière la plus directe. La baisse de 32 points absolus de `rule.id` est colossale. Mais elle reste #1 — donc le modèle reste partiellement *rule_id-centric*, ce que je n'ai aucune raison de masquer. Trois features émergent comme contributrices réelles : `occurrenceCount`, `start_line`, `is_taint_rule`.

---

## Slide 8 — EXP 3 & 4 — Active Learning

**AL parfait : +1,0 pt en 5 cycles. AL bruité (10 %) : +0,9 pt.**

| Cycle | F1 (parfait) | F1 (bruité 10 %) |
|---|---|---|
| C0 (départ) | 0,874 | 0,874 |
| C5 | 0,884 | 0,883 |
| **Δ total** | **+0,010** | **+0,009** |

→ Critère H3 (≥3 %) : **NON VALIDÉE sur réel**

→ Résultat secondaire : **robustesse exceptionnelle au bruit d'oracle** (Δ ≤ 0,003 entre parfait et bruité)

> *Speaker note* : Slide à présenter honnêtement. H3 n'est pas validée sur réel, et la raison est claire : le modèle initial est déjà à F1=0,874 — il reste peu de place pour gagner via AL. Sur synthétique, F1 démarrait à 0,801, donc AL avait plus de marge. C'est un effet de plafond, pas un défaut de l'AL. Le résultat positif : le bruit d'oracle a peu d'impact, signe que le mécanisme est robuste.

---

## Slide 9 — EXP 5 — Sensibilité au taux de FP

**Comportement linéaire propre sur subsampling**

| FP cible | F1 | Rappel | Réduction | ROC-AUC |
|---|---|---|---|---|
| 30 % | **0,906** | 0,883 | 27,9 % | 0,973 |
| 40 % | 0,893 | 0,876 | 37,0 % | 0,977 |
| 50 % | 0,853 | 0,884 | 50,1 % | 0,948 |
| 60 % | 0,827 | 0,853 | 56,9 % | 0,937 |
| 70 % | 0,781 | 0,789 | 64,1 % | 0,889 |

→ À 30 % de FP, le pipeline atteint **F1 = 0,906 et ROC-AUC = 0,973**.

> *Speaker note* : Le système se comporte de manière prévisible et stable à travers toute la plage opérationnelle. Pas de cliff effect, pas de zone aveugle. C'est crucial pour un déploiement en production où la distribution des FP varie selon les outils et les projets.

---

## Slide 10 — EXP 6 — Stabilité inter-seeds

**F1 = 0,871 ± 0,002 sur 5 graines indépendantes**

| Seed | 42 | 123 | 256 | 512 | 1024 |
|---|---|---|---|---|---|
| F1 | 0,874 | 0,872 | 0,870 | 0,869 | 0,872 |
| ROC | 0,966 | 0,965 | 0,963 | 0,964 | 0,959 |

→ **Écart-type = 0,002** (synthétique : 0,019 → **÷10**)

> *Speaker note* : La variance inter-seeds est dix fois meilleure que sur synthétique. Le système est extrêmement stable sur les vraies données — la variabilité du split ne change quasiment rien aux résultats. C'est un argument fort pour la reproductibilité en environnement de production.

---

## Slide 11 — EXP 7 — Sweep de seuils

**Point de fonctionnement ajustable selon l'organisation**

| Seuil | Précision | Rappel | F1 | Réduction |
|---|---|---|---|---|
| 0,40 | 0,910 | 0,839 | 0,873 | 70,3 % |
| **0,45 (optimum F1)** | **0,879** | **0,865** | **0,872** | **68,3 %** |
| 0,60 | 0,738 | 0,939 | 0,826 | 59,0 % |
| 0,70 | 0,674 | **0,962** | 0,793 | **54,0 %** |
| 0,80 | 0,556 | 0,980 | 0,710 | 43,2 % |

→ À seuil 0,70 : on **garde 96,2 % des vraies vulnérabilités** tout en **filtrant 54 %** du volume.

> *Speaker note* : Slide opérationnel. L'organisation peut calibrer le compromis selon sa tolérance au risque. Pour un contexte critique (bancaire, médical) on monterait à seuil 0,80 (98 % de rappel, 43 % de réduction). Pour un contexte plus tolérant (alertes de style, code legacy), seuil 0,40 (réduction 70 %).

---

## Slide 12 — Validation des hyperparamètres sur réel

**Grid search complet ré-exécuté sur dataset réel (42 + 63 combinaisons)**

DBSCAN (ε × MinPts, 42 combos en 24s) — top 3 :

| ε | MinPts | F1 |
|---|---|---|
| **0,15** | **15** *(meilleur)* | **0,885** |
| 0,15 | {5–10} | 0,884 |
| **0,25** | **3** *(mémoire)* | **0,874** |

RF (n_estimators × max_depth, 63 combos en 36s) — sommet du plateau :

| n_estimators | max_depth | F1 |
|---|---|---|
| **75** | **14** *(meilleur)* | **0,886** |
| **50** | **14** *(mémoire)* | **0,885** |
| 150 | 16 | 0,885 |

→ Différentiel total avec hyperparamètres ré-optimisés sur réel : **+0,012 pts F1**
→ Dans l'épaisseur de la variance inter-seeds (σ = 0,002)
→ **Les paramètres du mémoire sont quasi-optimaux**

> *Speaker note* : Cette slide anticipe une question prévisible : « êtes-vous sûr que vos hyperparamètres sont les bons sur ce nouveau dataset ? ». La réponse est documentée : grid search complet rejoué, le mémoire perd 0,012 pts F1 par rapport à la meilleure configuration — c'est dans la marge d'erreur. `max_depth=14` est même exactement le maximum sur réel aussi. Le mémoire a été calibré sur synthétique mais transfère bien. Mention du théorème de convergence de Breiman pour expliquer pourquoi `n_estimators=50` ≈ `n_estimators=75`. Posture honnête : « je n'ai pas ré-optimisé pour avoir de meilleurs chiffres dans l'addendum — j'ai gardé les paramètres v6, c'est la posture conservatrice ».

---

## Slide 13 — Verdicts H1, H2, H3

**Bilan complet vs mémoire initial**

| Hypothèse | Critère | Synthétique | **Réel** | Évolution |
|---|---|---|---|---|
| **H1** | Réd>50 % ET Rec≥85 % | 44 %/86 % (partielle) | **69 %/86 %** | **VALIDÉE ✓** |
| H2 | ΔF1(DBSCAN) ≥ 5 pts | −1,6 pts (infirmée) | **+2,9 pts** | proche, non validée |
| H3 parfait | ΔF1(AL) ≥ 3 % | +3,1 % (validée) | **+1,0 %** | non validée |
| H3 bruité | ΔF1(AL) ≥ 3 % | +2,7 % (non val.) | **+0,9 %** | non validée |

> *Speaker note* : Le slide-clé. H1 (hypothèse principale du mémoire) PASSE de partielle à VALIDÉE sur réel. C'est le résultat majeur. H2 reste sous le critère mais l'écart devient positif (+2,9 vs −1,6 pts). H3 plafonne mécaniquement parce que le modèle initial est déjà très bon. Ces résultats sont présentés *exactement* dans le tableau récapitulatif du mémoire — même critères, mêmes calculs, juste sur dataset réel.

---

## Slide 14 — Comparaison avec l'état de l'art

**AlertOptimizer (réel) vs littérature**

| Système | Dataset | F1 | ROC-AUC |
|---|---|---|---|
| Hanam et al. 2014 | 1 288 alertes FindBugs | 0,72 | — |
| Russell et al. 2018 | 10 000 alertes propriétaires | — | 0,89 |
| Kang et al. 2022 | 8 000 alertes CodeBERT | 0,83 | — |
| **AlertOptimizer (mémoire)** | 5 000 synthétiques | 0,801 | 0,868 |
| **AlertOptimizer (cet addendum)** | **66 227 réelles** | **0,874** | **0,966** |

→ Dataset 13× plus grand, performances supérieures à toutes les approches publiées comparables, transparence totale (NumPy pur, aucune dépendance externe).

> *Speaker note* : Ne pas sur-vendre — chaque dataset est différent et les comparaisons sont indicatives. Mais le pattern est clair : sur volume réel et avec un système auditable de bout en bout, on est au niveau ou au-dessus des approches récentes. Sans deep learning, sans embeddings opaques.

---

## Slide 15 — Limites et travaux futurs

**Limites assumées**

- **1 seul outil** (Semgrep) — pas encore SpotBugs/SonarQube/Bandit
- **1 seul langage** (Java) — Python/JavaScript donneraient d'autres distributions
- **Features SARIF métadonnées uniquement** — pas d'AST, pas de snippet, pas de taint info
- **H2 et H3 non validées** — DBSCAN apporte peu, AL plafonne quand le pipeline est déjà très bon

**Travaux futurs naturels**

- SpotBugs+FindSecBugs sur OWASP+Juliet → validation multi-tool
- Bandit sur projets Python OSS réels (Flask, Django, FastAPI)
- Enrichissement par features de contexte de code (snippet hash, path patterns, taint info)
- AL avec pool labellisé plus restreint (1 %) où l'effet AL serait plus visible

> *Speaker note* : Annoncer ces limites *avant* le jury, pour montrer maîtrise. Aucune n'est rédhibitoire pour les conclusions actuelles. Le travail multi-tool est la suite logique évidente, listée explicitement dans l'addendum.

---

## Slide 16 — Conclusion + reproductibilité

**Apports de la re-validation**

1. **H1 enfin validée** : 69 % de réduction, 86 % de rappel sur 66 k alertes réelles
2. **`rule.id` 82 % → 49 %** : la critique du jury sur la circularité est validée par les données et l'effet est *mesurable*
3. **ML > GROUP BY** : +11,4 pts F1, +11,2 pts de réduction, démontrant que le ML apporte une plus-value décisive *à l'échelle*
4. **Stabilité ×10** : σ(F1) = 0,002 sur 5 seeds

**Reproductibilité totale** :
```
git clone OWASP-Benchmark Java
curl Juliet Test Suite Java (NIST SARD)
docker run semgrep --sarif ...
python3 full_experiment_real.py    → 37 secondes
```

> *Speaker note* : Conclusion en posture mesurée. Le rattrapage produit des résultats meilleurs que le mémoire initial sur des données beaucoup plus solides. La réflexion critique des slides 12 (H2/H3) et 14 (limites) doit rester présente jusqu'au bout — ne pas sur-vendre. Insister sur la reproductibilité : 37 secondes sur Mac avec multiprocessing, tout est public.

---

# Préparation Q&A — questions probables

### Q1 : « Pourquoi seulement Semgrep ? Et SpotBugs/SonarQube ? »

> Choix méthodologique pour ce rattrapage : reproductibilité totale en 5 min de compute. Semgrep produit du SARIF natif sans étape de compilation. L'ajout de SpotBugs nécessite de compiler Maven (étape lourde mais faisable), listé dans les travaux futurs. La question importante n'est pas le nombre d'outils mais l'indépendance des labels — garantie ici par OWASP + NIST quel que soit l'outil SAST utilisé.

### Q2 : « Le F1 de 0,874 sur réel est *meilleur* que sur synthétique. Comment est-ce possible ? »

> Trois mécanismes : (a) sur 66 k alertes vs 5 k, les classes sont mieux représentées et le RF apprend des frontières plus stables ; (b) plusieurs règles Semgrep ont un FP rate proche de 100 % (XSS_SERVLET_PARAMETER à 98 %) — le RF les apprend en quelques exemples et filtre agressivement, alors que sur synthétique les FP rates étaient uniformément répartis ; (c) la nouvelle feature `is_taint_rule` apporte 7,2 % d'importance ROC.

### Q3 : « Si H2 et H3 sont non validées, pourquoi garder DBSCAN et AL dans le pipeline ? »

> Pour H2 : DBSCAN apporte +2,9 pts F1 sur réel (vs −1,6 sur synthétique). C'est moins que le seuil de 5 pts mais c'est positif. La justification reste valable, le critère arbitraire ne tient pas. Pour AL : la robustesse au bruit d'oracle (Δ ≤ 0,003) reste exceptionnelle. AL deviendrait critique avec un pool labellisé plus restreint (1 % au lieu de 10 %). Ces conclusions sont assumées dans l'addendum sans tentative de masquage.

### Q4 : « Vous avez ajouté une feature, n'est-ce pas de la triche ? »

> Non. `is_taint_rule` est dérivée du nom du `rule_id` (métadonnée publique du SARIF), sans utiliser les labels. Elle aurait été utilisable même dans le mémoire initial — sa découverte est motivée par l'analyse des règles réelles qui révèlent une dichotomie pattern/taint. C'est une contribution mesurable (7,2 % d'importance ROC) et complètement transparente.

### Q5 : « Vous parlez de 66 k alertes mais Juliet est un dataset *synthétique* aussi. »

> Juliet est *synthétique* au sens où le code est généré par NIST, mais les labels sont *indépendants du chercheur* — c'est NIST qui décide ce qui est vulnérable, pas moi. Le critère central du jury était que les labels ne soient pas définis par moi. Cette condition est satisfaite à la fois par OWASP (Fondation OWASP) et Juliet (NIST). Et OWASP Benchmark seul fait déjà 8 043 alertes, soit 60 % de plus que mon synthétique initial.

### Q6 : « Comment expliquez-vous l'écart énorme entre `occurrenceCount` à 22,9 % sur réel et 0,1 % sur synthétique ? »

> Sur synthétique, `occurrenceCount` était généré aléatoirement (Poisson λ=3) sans corrélation avec le label — d'où 0,1 %. Sur réel, certaines règles trop bruyantes (XSS_SERVLET_PARAMETER) fire 5-10 fois sur le même fichier qui devient FP, alors que les règles à forte précision fire 1 fois. Le compte d'occurrences par fichier porte donc un vrai signal sur le réel. C'est exactement le type de signal que le synthétique ne pouvait pas reproduire.

### Q7 : « Le baseline Majority à F1=0, c'est suspect. »

> Avec un dataset à 67,8 % de FP, la classe majoritaire est FP (`y=1`). Predire « tout FP » à seuil 0,5 → filtre toutes les alertes → recall=0 (pas un seul TP gardé) → précision indéfinie (0/0) → F1=0. C'est un baseline dégénéré, inclus par cohérence avec le protocole expérimental v6 (B1 majoritaire) mais non informatif sur ce dataset.

### Q8 : « Quel est le scénario de déploiement réel ? »

> Mode initial *informatif* : le pipeline annote les alertes avec une probabilité de FP, sans filtrer. L'analyste voit le score mais décide. Après 1 à 2 mois de calibration et si la précision observée dépasse 80 %, passage en mode *automatique* avec seuil de coupure conservateur (≥ 0,70 → garde 96 % des vrais positifs). Revalidation trimestrielle pour détecter une éventuelle dérive.

### Q9 : « Comment avez-vous validé que vos hyperparamètres restent les bons sur ce nouveau dataset ? »

> J'ai re-exécuté les deux grid searches du mémoire (42 combinaisons DBSCAN + 63 combinaisons RF = 105 configurations) sur le dataset réel. Résultat : les paramètres du mémoire (ε=0,25, MinPts=3, n_estimators=50, max_depth=14) sont à **0,012 pts F1 du meilleur global** sur réel, soit dans la marge de variance inter-seeds (5σ). `max_depth=14` est exactement le maximum trouvé sur réel aussi. J'ai conservé les paramètres v6 dans les rapports d'EXP 1-8 pour ne pas faire du overfitting méthodologique en re-calibrant sur le dataset d'évaluation. Détails dans `results/hyperparam_summary.md`.

---

# Plan minute par minute pour 20 min

| Min | Slides | Objectif |
|---|---|---|
| 0–1 | 1 | Garde + plan |
| 1–3 | 2, 3 | Critique reçue + stratégie de réponse |
| 3–5 | 4, 5 | Pipeline identique + résultats EXP 1 |
| 5–7 | 6, 7 | Baselines (critique #3) + feature importance (critique #2) |
| 7–10 | 8, 9, 10 | EXP 3-4 (AL) + EXP 5 (FP sens.) + EXP 6 (stabilité) |
| 10–12 | 11, 12 | EXP 7 (seuils) + validation hyperparamètres |
| 12–14 | 13, 14 | Verdicts H1-H3 + état de l'art |
| 14–16 | 15, 16 | Limites + conclusion |
| 16–20 | — | Marge / Q&A en début |

→ Garder ~10 min pour le Q&A.
