# AlertOptimizer — Rattrapage

Cette branche de travail répond à la critique du jury sur le dataset synthétique. Toutes les expérimentations sont menées sur **OWASP Benchmark Java**, un dataset public où les labels (TP/FP) viennent par construction du framework de test, pas du chercheur.

## Structure

- `data/` — datasets bruts (OWASP Benchmark clone + labels CSV)
- `tools/` — binaires/configs des outils SAST (SpotBugs+FindSecBugs, Semgrep)
- `results/` — sorties SARIF des outils, datasets joints, prédictions
- `scripts/` — code Python pour pipeline+baselines sur données réelles
- `addendum/` — document complémentaire pour le rattrapage

## Motivation

Critique du jury (soutenance initiale) :
1. Dataset synthétique → modèle "redécouvre" les patterns programmés
2. `rule.id` à 81,7 % de l'importance → table de correspondance
3. Des requêtes simples (GROUP BY) suffiraient

Réponse expérimentale :
- Dataset où les labels sont indépendants du chercheur (OWASP Benchmark)
- Vraie baseline GROUP BY rule_id avec smoothing
- Ajout d'une feature contextuelle (`is_test_path`) au-delà des métadonnées SARIF
- Comparaison honnête de toutes les méthodes

## Reproductibilité

Voir `scripts/run_full_pipeline.sh` (généré à la fin de l'intégration).
