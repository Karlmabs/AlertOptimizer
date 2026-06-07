# AlertOptimizer — UI de soutenance

Assistant interactif **en 10 étapes** qui reconstruit tout le projet depuis zéro, directement depuis l'interface : récupération des sources → scan SAST → dataset → grid search → pipeline → baselines → apprentissage actif → verdicts. Chaque étape **explique ce qu'elle va faire**, la **lance en direct** (flux de progression via SSE), puis affiche ses **résultats et ses paramètres**.

Pensé pour la soutenance : le jury voit le système se construire sous ses yeux, sans qu'il faille tout expliquer à l'oral.

- **Frontend** : Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Framer Motion, Recharts, lucide-react.
- **Backend** : FastAPI + uvicorn + sse-starlette — wrappe les scripts Python et streame leur stdout.

## Lancer

> Guide complet (prérequis Docker/Node/venv inclus) : **[../../QUICKSTART.md](../../QUICKSTART.md)** section B.

Terminal 1 — backend FastAPI sur `:8000`
```bash
cd rattrapage/ui/backend
./start.sh
```

Terminal 2 — frontend Next.js sur `:3002`
```bash
cd rattrapage/ui/frontend
npm install            # première fois
npm run dev -- -p 3002
```

Ouvre **http://localhost:3002**.

## Les 10 étapes du wizard

| # | Slug | Titre | Endpoint backend |
|---|---|---|---|
| 1 | `sources` | Récupération des sources | `/api/workflow/sources` |
| 2 | `labels` | Extraction des labels | `/api/workflow/labels` |
| 3 | `scan` | Scan SAST (Semgrep) | `/api/workflow/scan` |
| 4 | `dataset` | Labellisation et merge | `/api/workflow/dataset` |
| 5 | `features` | Extraction des features | `/api/workflow/features` |
| 6 | `grid-search` | Recherche des hyperparamètres | `/api/workflow/grid-search` |
| 7 | `pipeline` | Pipeline DBSCAN + Random Forest | `/api/workflow/pipeline` |
| 8 | `baselines` | Comparaison avec les baselines | `/api/workflow/baselines` |
| 9 | `active-learning` | Apprentissage actif (5 cycles) | `/api/workflow/active-learning` |
| 10 | `verdicts` | Verdicts H1 / H2 / H3 | *(synthèse locale)* |

> L'étape **7 (Pipeline) hérite automatiquement** des meilleurs hyperparamètres trouvés à l'étape 6 (`best_eps`, `best_min_pts`, `best_n_estimators`, `best_max_depth`).

## Ateliers d'analyse fine

Débloqués **après l'étape 7** (le pipeline produit l'état qu'ils consomment) :

| Route | Atelier |
|---|---|
| `/threshold` | sweep du seuil de décision (précision/rappel/F1) |
| `/hyperparams` | heatmaps grid search ε×MinPts et n×depth |
| `/alerts` | exploration alerte par alerte du pool |
| `/active-learning` | courbes parfait vs bruité |

Avant l'étape 7, ces pages affichent un bandeau « données manquantes » qui renvoie vers le wizard — c'est normal.

## Structure

```
rattrapage/ui/
├── backend/                    FastAPI
│   ├── main.py                 endpoints data + santé
│   ├── workflow.py             les 10 étapes en flux SSE
│   ├── requirements.txt        fastapi, uvicorn, sse-starlette
│   ├── start.sh                lance uvicorn via le venv du projet (../../../venv)
│   └── README.md
└── frontend/                   Next.js 15
    ├── src/
    │   ├── app/                une route par page (step/, threshold/, alerts/, …)
    │   ├── components/         workflow-step, nav-sidebar, charts, compteurs animés
    │   └── lib/                workflow.ts (déf. des étapes), data.ts, cache.ts, api client
    └── public/data/            workbench_state.json + workbench_pool.json (lus côté serveur)
```

## Variables d'environnement

`frontend/.env.local` (optionnel) :
```
NEXT_PUBLIC_API=http://127.0.0.1:8000
```
Par défaut le frontend cible déjà `http://127.0.0.1:8000`.

## État persistant

Le statut de chaque étape (pending / running / done / error) est conservé dans le `localStorage` du navigateur, donc le wizard survit à un rafraîchissement de page. Pour tout réinitialiser côté données et tester le « rebuild from scratch », supprime `rattrapage/data/` et `rattrapage/results/semgrep_*.sarif.json`.
