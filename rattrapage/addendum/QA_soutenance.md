# Fiche Q&A — soutenance de rattrapage

> À étudier et répéter à voix haute. Chaque réponse tient en 2-3 phrases.
> Règle d'or : **assumer**, ne jamais être sur la défensive. Un résultat « négatif » présenté lucidement vaut mieux qu'un chiffre vert suspect.

---

## Ouverture (≈ 2 min, à dire de mémoire)

> « Lors de ma première soutenance, vous m'avez fait trois reproches précis : mon dataset synthétique ne permettait pas de tester réellement le système ; mon modèle reposait sur `rule.id` à 81,7 %, comme une table de correspondance ; et une simple requête `GROUP BY rule_id` aurait sans doute suffi.
>
> J'ai pris ces trois critiques au sérieux et j'ai **tout re-testé de zéro sur des données réelles** — 66 227 alertes issues d'OWASP Benchmark et de NIST Juliet, labellisées par ces organismes, pas par moi.
>
> Résultat : le F1 passe de 0,801 à 0,874, `rule.id` tombe à 49 %, et mon pipeline bat le GROUP BY de 11 points de F1. Je vais vous montrer ça en direct dans l'outil. »

---

## 1. Dataset & circularité

**Q — Vos données restent des benchmarks synthétiques (OWASP, Juliet), pas du code de production. La circularité n'est-elle pas juste déplacée ?**
La circularité que vous visiez portait sur les **labels** : dans mon mémoire, c'est moi qui décidais ce qui était vrai ou faux positif. Ici les labels viennent d'OWASP et du NIST, ils existaient avant mon travail, et n'importe qui peut refaire la jointure. Le code est effectivement du benchmark — ce sont les suites d'évaluation standard du domaine — mais le signal d'apprentissage, lui, ne dépend plus de moi.
*Si on insiste :* l'étape suivante serait un dataset comme D2A (alertes sur de vrais projets OSS, labels par commits de correction) ; je le cite en perspective.

**Q — Pourquoi avoir mélangé OWASP et Juliet ?**
Pour le volume et la diversité : OWASP apporte des cas web ciblés (8 043 alertes), Juliet apporte l'échelle et 112 CWE (58 184 alertes). Ensemble, 66 227 alertes — 13× mon dataset synthétique. Et je teste justement, dans l'atelier Généralisation, ce qui se passe quand on les sépare.

**Q — Comment une alerte devient-elle TP ou FP ?**
Je regarde le fichier où l'alerte a été levée, puis la table de vérité OWASP/NIST. C'est un vrai positif si le fichier est vulnérable **et** que la CWE de la règle correspond à la catégorie du fichier ; sinon faux positif. Aucune décision de ma part.

---

## 2. rule.id & « table de correspondance »

**Q — `rule.id` reste votre feature n°1 à 49 %. Le modèle ne reste-t-il pas un dictionnaire de règles ?**
49 %, c'est moins de la moitié, contre 81,7 % sur le synthétique — la dominance s'effondre. Et surtout, dans l'atelier Généralisation, je **coupe complètement `rule.id`** : le F1 ne tombe qu'à 0,72 (ROC 0,88). Un dictionnaire de règles s'écroulerait ; le mien tient grâce aux autres features. Donc non, ce n'est pas une table de correspondance.

**Q — Pourquoi `rule.id` compte-t-il encore autant ?**
Parce que certaines règles sont quasi déterministes : sur le réel, des règles produisent 98 % de FP ou 95 % de TP. Le modèle a raison de s'appuyer dessus — ce serait absurde de l'ignorer. La différence, c'est qu'il combine maintenant `rule.id` avec le contexte (densité d'alertes, taint, cluster), au lieu de ne faire que ça.

**Q — Qu'est-ce que `occurrenceCount` exactement ?**
C'est le **nombre d'alertes qui partagent le même fichier**, normalisé. Ce n'est pas le champ `occurrenceCount` de SARIF (Semgrep ne le remplit pas) — c'est une densité de co-localisation que je calcule. C'est ma feature n°2 (22,9 %) : un fichier saturé d'alertes est plus souvent une zone de faux positifs.

**Q — Vous avez `level`, `rank` et `severity` : ce ne sont pas trois fois la même chose ?**
Si, en partie : Semgrep ne remplit que `level`, donc `rank` et `severity` en sont dérivés. Elles sont volontairement gardées pour rester fidèle au gabarit à 8 features du mémoire, mais leur importance est minuscule (0,3 à 0,8 %) — ce qui est cohérent avec leur redondance. Je l'assume comme une limite.

---

## 3. GROUP BY & plus-value du ML

**Q — Un `GROUP BY rule_id` ne suffit-il vraiment pas ?**
Sur petit volume, il s'en sortait — c'est pour ça que la critique était juste à l'époque. Mais sur 66 k alertes avec 58 règles, mon pipeline le bat de **+11,4 points de F1** (0,874 vs 0,760). Le GROUP BY plafonne parce qu'il ne voit que la règle ; dès qu'une règle est ambiguë (FP rate entre 30 et 60 %), il est perdu, et c'est là que le ML gagne.

**Q — Où le GROUP BY est-il optimal, alors ?**
Sur les règles binaires (0 % ou 100 % de FP) : là, le ML n'apporte rien, le GROUP BY est même optimal. Je l'assume — la plus-value du ML est sur les règles intermédiaires, et c'est ce qui fait les +11,4 points à l'échelle réelle.

**Q — Cet écart de 11 points est-il significatif statistiquement ?**
*(Si tu n'as pas encore ajouté le test :)* C'est une valeur ponctuelle, stable sur 5 graines (σ = 0,002 sur le F1). Un test de McNemar serait la prochaine étape pour le formaliser. *(Si tu l'as ajouté :)* Oui : McNemar p < 0,001, IC95 % [X ; Y].

---

## 4. Méthodologie & rigueur

**Q — Comment évitez-vous les fuites de données entre train et test ?**
Split stratifié 10 % labeled / 40 % pool / 50 % test, jamais d'alerte partagée. Dans les ateliers Généralisation et Adaptation, je choisis même le **seuil de décision sur le train**, jamais sur le test, pour éviter toute fuite de seuil.

**Q — Vos hyperparamètres ne sont-ils pas sur-ajustés ?**
Non, et je le prouve : la grid search (105 configurations) montre que mes réglages sont à **0,012 point de F1** de l'optimum trouvé sur le réel. Je n'ai pas ré-optimisé sur les données d'évaluation — c'est la posture conservatrice.

**Q — Pourquoi DBSCAN et Random Forest, et pas du deep learning ?**
Trois raisons : interprétabilité (je peux expliquer chaque décision au jury), implémentation NumPy pure (auditable, zéro dépendance), et c'est suffisant — j'atteins ROC-AUC 0,966. Un réseau de neurones serait une boîte noire pour un gain non démontré sur des features de métadonnées.

**Q — Pourquoi NumPy pur et pas scikit-learn ?**
Pour l'auditabilité et la sécurité de la chaîne d'approvisionnement : dans un contexte DevSecOps, dépendre de moins de code tiers est un argument. Et ça prouve que je maîtrise les algorithmes, pas juste l'API.

---

## 5. Hypothèses (surtout les échecs)

**Q — H2 et H3 ne sont pas validées. N'est-ce pas un échec ?**
C'est un résultat, pas un échec, et je sais l'expliquer. Pour H2, DBSCAN passe de **nuisible** sur le synthétique (−1,6 pt) à **utile** sur le réel (+2,9 pts) — il aide, juste pas des 5 points visés. Pour H3, l'AL ne gagne qu'1 point parce que le modèle démarre déjà à 0,874 : il reste peu de marge in-distribution.

**Q — Si H3 échoue, l'apprentissage actif est-il inutile ?**
Au contraire. In-distribution il plafonne parce que le modèle est déjà bon. Mais dans l'atelier Adaptation, sur un dataset **jamais vu**, l'AL récupère ~66 % de l'écart — c'est là qu'il est décisif. H3 était mal posée : elle testait l'AL là où il y avait le moins à gagner.

**Q — H1 validée, c'est votre seul vrai succès ?**
H1 était l'hypothèse principale, et elle passe de partielle à **validée** : 69 % de réduction du volume d'alertes en gardant 86 % des vraies failles. En production, ça veut dire éliminer deux tiers du bruit sans perdre le signal de sécurité. C'est le résultat qui compte le plus.

---

## 6. Généralisation (LODO) — le sujet délicat

**Q — Votre modèle ne généralise pas d'un dataset à l'autre (F1 0,39 en croisé). C'est rédhibitoire, non ?**
C'est honnête et c'est attendu. Les faux positifs SAST sont **spécifiques au projet et à l'outil** — c'est documenté dans la littérature. Aucun modèle ne fait du zéro-shot parfait là-dessus. L'important, c'est ce que je fais ensuite : je m'adapte avec quelques labels, et c'est exactement ce que montre l'atelier Adaptation.

**Q — Pourquoi avoir montré un résultat qui vous dessert ?**
Parce que si je ne l'avais pas mesuré, vous l'auriez fait — et là ça m'aurait coulé. Caractériser les limites de son système, c'est de la rigueur scientifique, pas une faiblesse. Je préfère arriver avec la réponse qu'avec le trou.

---

## 7. Apprentissage actif cross-dataset

**Q — Vous dites que l'échantillonnage par incertitude est battu par le hasard. C'est gênant pour votre mémoire, non ?**
C'est un résultat que j'assume et qui montre que j'ai creusé. Sous changement de distribution, le modèle est mal calibré sur le nouveau domaine, donc ses points « incertains » sont du bruit non représentatif — l'aléatoire échantillonne mieux la nouvelle distribution. C'est un mode de défaite connu de l'AL, et je le quantifie au lieu de le cacher.

**Q — Que retenez-vous, alors, sur l'AL ?**
Que l'adaptation marche (66 % du gap récupéré avec quelques centaines de labels), mais que **la stratégie d'acquisition dépend du régime** : incertitude en distribution, aléatoire sous fort changement. C'est une nuance utile pour quiconque déploierait le système.

---

## 8. Limites & déploiement

**Q — Un seul outil (Semgrep), un seul langage (Java). Est-ce généralisable ?**
Non, et je l'assume comme limite explicite. L'architecture est agnostique (entrée SARIF, standard OASIS), donc ajouter SpotBugs/CodeQL ou Python/Bandit est une suite naturelle. Mais je ne prétends pas l'avoir prouvé — je prouve que ça marche sur Java + Semgrep, à grande échelle.

**Q — Vos features sont uniquement des métadonnées, pas le code. N'est-ce pas limitant ?**
Si, c'est un choix assumé : features légères, portables, auditables, sans analyse du code source. Avec des features de code (AST, taint réel), l'écart avec le GROUP BY serait probablement encore plus grand — c'est une piste, pas une lacune du résultat actuel.

**Q — Comment ce système se déploierait-il en vrai ?**
En post-traitement d'un scan SAST : il classe les alertes par probabilité de faux positif, l'équipe règle le seuil selon sa tolérance au risque (à 0,70, on garde 96 % des failles). Et on l'adapte au projet avec quelques annotations, comme dans l'atelier Adaptation.

---

## 9. Questions « méta » (les plus dangereuses)

**Q — Une grande partie de la rédaction semble assistée par IA. Avez-vous réellement fait ce travail ?**
La rédaction, je l'ai outillée, mais l'expérimentation et le code sont à moi et je peux tout vous expliquer ligne par ligne, là, maintenant. D'ailleurs tout est rejouable en direct dans l'outil — aucun chiffre n'est figé dans une slide. *(Puis : proposer de lancer une expérience en live.)*

**Q — Qu'avez-vous appris de votre premier échec ?**
Que présenter des résultats sur un dataset que je contrôlais ne prouvait rien. La leçon de fond : un système se juge sur des données indépendantes et sur ce qu'il rate, pas seulement sur ses bons chiffres. Tout mon rattrapage est construit là-dessus.

**Q — Si vous aviez trois mois de plus, que feriez-vous ?**
Un dataset de code réel (type D2A), un deuxième outil SAST pour valider la promesse multi-outils, et un test de significativité formel sur l'écart ML/GROUP BY. Dans cet ordre.

---

## Chiffres à connaître par cœur

| | Synthétique | **Réel** |
|---|---|---|
| Alertes | 5 000 | **66 227** (OWASP 8 043 + Juliet 58 184) |
| Règles déclenchées | 32 | **58** |
| Taux de FP | ~51 % | **67,8 %** |
| F1 | 0,801 | **0,874** |
| ROC-AUC | 0,868 | **0,966** |
| Réduction / Rappel | 44 % / 86 % | **69 % / 86 %** |
| `rule.id` (importance) | 81,7 % | **49,1 %** |
| Stabilité σ(F1), 5 graines | 0,019 | **0,002** |
| Pipeline vs GROUP BY | — | **+11,4 pts F1** |
| Sans `rule.id` (ablation) | — | **F1 0,72 / ROC 0,88** |
| LODO croisé vs in-distrib | — | **0,39 vs 0,84** |
| AL cross-dataset (gap récupéré) | — | **~66 %** |

**Pipeline :** DBSCAN (ε=0,25, MinPts=3) + Random Forest (50 arbres, profondeur 14), NumPy pur. 11 features (8 SARIF + 1 contexte + 2 cluster). Seuil par défaut 0,45.
