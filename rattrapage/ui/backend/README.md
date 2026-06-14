# AlertOptimizer Backend (FastAPI)

Wrappe les scripts d'expérience du rattrapage pour que le wizard UI puisse les **rejouer en direct** avec des flux Server-Sent Events (SSE).

## Lancer

```bash
cd rattrapage/ui/backend
pip install -r requirements.txt   # dans le venv du projet (../../../venv)
./start.sh                        # uvicorn sur http://127.0.0.1:8000
```

`start.sh` utilise le venv à la racine du projet (`../../../venv`). Crée-le d'abord si besoin — voir [../../QUICKSTART.md](../../QUICKSTART.md).

## Endpoints du wizard (flux SSE, un par étape)

| Méthode | Chemin | Étape |
|---|---|---|
| `GET` | `/api/workflow/sources` | 1 — clone OWASP + télécharge/décompresse Juliet |
| `GET` | `/api/workflow/labels` | 2 — vérité-terrain depuis les frameworks |
| `GET` | `/api/workflow/scan` | 3 — scan Semgrep (Docker) → SARIF |
| `GET` | `/api/workflow/dataset` | 4 — merge alertes + labels |
| `GET` | `/api/workflow/features` | 5 — extraction des features |
| `GET` | `/api/workflow/grid-search` | 6 — grid search DBSCAN + RF |
| `GET` | `/api/workflow/pipeline` | 7 — entraînement + évaluation |
| `GET` | `/api/workflow/baselines` | 8 — pipeline vs GROUP BY / RF seul / … |
| `GET` | `/api/workflow/active-learning` | 9 — 5 cycles d'apprentissage actif |

> L'étape 10 (verdicts H1/H2/H3) est une synthèse calculée côté frontend.

## Endpoints data / ateliers

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/health` | sanity check + fichiers présents |
| `GET` | `/api/results` | résultats agrégés des expériences |
| `GET` | `/api/dataset-stats` | stats sur le dataset réel |
| `GET` | `/api/alerts` | liste paginée des alertes du pool |
| `GET` | `/api/alert/{id}/source` | extrait du code source d'une alerte |
| `POST` | `/api/retrain` | ré-entraîne avec de nouveaux hyperparams |
| `POST` | `/api/active-learning/step` | un cycle d'AL interactif |
| `GET` | `/api/run/experiment` | (SSE) rejoue `full_experiment_real.py` |
| `GET` | `/api/run/grid-search` | (SSE) rejoue `grid_search.py` |
| `GET` | `/api/run/merge-datasets` | (SSE) rejoue `merge_datasets.py` |
| `GET` | `/api/run/lodo` | (SSE) rejoue `lodo_ablation.py` (généralisation + ablation) |
| `GET` | `/api/run/al-cross` | (SSE) rejoue `al_cross_dataset.py` (adaptation) |
| `GET` | `/api/run/significance` | (SSE) rejoue `significance.py` (McNemar + bootstrap) |

## CORS

Ouvert à `http://localhost:3000/:3001/:3002` et, par regex, à tout domaine `*.orb.local` (OrbStack). **Pour la démo, ouvrir l'UI sur `http://localhost:3002`** — l'URL HTTPS `*.orb.local` déclenche un blocage mixed-content vers le backend HTTP.

## Variables d'environnement

- `N2W_PYTHON` — interpréteur utilisé pour lancer les scripts (défaut : le venv du projet `../../../venv/bin/python`). Mettre `python3` quand le backend tourne en conteneur.

## Prérequis système

- **Docker** en marche (le scan Semgrep tourne dans `returntocorp/semgrep:latest`).
- `git`, `curl`, `unzip` pour la récupération des sources.
- Python : `fastapi`, `uvicorn`, `sse-starlette`, `numpy` (voir `requirements.txt`).
