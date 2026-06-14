# QUICKSTART — AlertOptimizer

Deux façons d'exécuter le projet : le **pipeline synthétique** (mémoire initial, 30 secondes) ou la **re-validation complète sur données réelles** via le wizard UI (rattrapage, ~30-60 min selon la machine et le réseau).

---

## A. Pipeline synthétique (le plus rapide)

```bash
git clone https://github.com/karlmabs/AlertOptimizer.git
cd AlertOptimizer
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt        # numpy seulement
python alertoptimizer.py               # rejoue les 8 expériences
```

➡️ Résultats dans `alertoptimizer_results.json`.

---

## B. Rattrapage sur données réelles (wizard UI)

Le wizard reconstruit **tout depuis zéro** : il télécharge OWASP Benchmark + NIST Juliet, lance le scan Semgrep, construit le dataset de 66 227 alertes, fait la grid search, puis le pipeline, les baselines, l'apprentissage actif et les verdicts H1/H2/H3 — chaque étape étant rejouée en direct avec un flux de progression.

### Prérequis

| Outil | Pourquoi | Vérifier |
|---|---|---|
| **Python 3.10+** | backend + scripts | `python3 --version` |
| **Node.js 18+ & npm** | frontend Next.js | `node --version` |
| **Docker** | Semgrep tourne en conteneur (`returntocorp/semgrep`) | `docker info` |
| **git, curl, unzip** | récupération des sources OWASP/Juliet | déjà présents sur macOS/Linux |

### 1. Cloner + créer le venv

```bash
git clone https://github.com/karlmabs/AlertOptimizer.git
cd AlertOptimizer
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt                       # numpy (pipeline)
pip install -r rattrapage/ui/backend/requirements.txt # fastapi, uvicorn, sse-starlette
```

### 2. Lancer le backend (terminal 1)

```bash
cd rattrapage/ui/backend
./start.sh            # uvicorn sur http://127.0.0.1:8000 via le venv du projet
```

Sanity check : `curl http://127.0.0.1:8000/api/health`

### 3. Lancer le frontend (terminal 2)

```bash
cd rattrapage/ui/frontend
npm install           # première fois seulement
npm run dev -- -p 3002
```

Ouvre **http://localhost:3002**.

> Le port **3002** est utilisé pour éviter un conflit fréquent avec d'autres dev servers sur 3000/3001. Si tu changes de port, le frontend reste sur `http://127.0.0.1:8000` pour l'API (configurable via `frontend/.env.local` → `NEXT_PUBLIC_API=`).

> ⚠️ **Ouvre bien `http://localhost:3002`** — pas une URL HTTPS auto-générée (type `*.orb.local` sous OrbStack). Une page HTTPS ne peut pas appeler le backend en HTTP local (blocage *mixed-content*) et le badge afficherait « backend offline ».

### 4. Suivre le wizard (10 étapes)

Chaque étape t'explique ce qu'elle fait **avant** de lancer, streame sa progression, puis affiche ses résultats et ses paramètres.

| # | Étape | Ce qu'elle fait |
|---|---|---|
| 1 | Récupération des sources | clone OWASP Benchmark + télécharge/décompresse Juliet |
| 2 | Extraction des labels | construit la vérité-terrain depuis les frameworks de test |
| 3 | Scan SAST (Semgrep) | scanne le code Java en Docker → SARIF |
| 4 | Labellisation et merge | joint alertes + labels → **66 227 alertes** |
| 5 | Extraction des features | 8 features SARIF + `is_test_path` |
| 6 | Recherche des hyperparamètres | grid search DBSCAN (ε×MinPts) + RF (n×depth) |
| 7 | Pipeline DBSCAN + Random Forest | hérite des meilleurs hyperparams, entraîne, évalue |
| 8 | Comparaison avec les baselines | pipeline vs RF seul vs **GROUP BY** vs Random vs Majority |
| 9 | Apprentissage actif (5 cycles) | uncertainty sampling, parfait vs bruité |
| 10 | Verdicts H1 / H2 / H3 | synthèse finale |

Une fois l'étape 7 (Pipeline) terminée, les **7 ateliers d'analyse fine** se débloquent : `/threshold`, `/hyperparams`, `/alerts`, `/active-learning`, `/generalization` (LODO + ablation rule.id), `/al-cross` (adaptation cross-dataset), `/significance` (McNemar + bootstrap).

### Reprise / cache

Les étapes coûteuses sont **mises en cache** : si les SARIF ou le dataset existent déjà, l'étape correspondante les réutilise au lieu de tout refaire. Pour repartir de zéro, supprime `rattrapage/data/` et `rattrapage/results/semgrep_*.sarif.json` — le wizard saura tout reconstruire.

---

## Dépannage

| Symptôme | Cause / solution |
|---|---|
| Étape 3 échoue | Docker non démarré → `docker info`. Première exécution : l'image Semgrep se télécharge (~quelques min). |
| Le frontend affiche un bandeau « données manquantes » | Normal avant l'étape 7. Les ateliers fins ont besoin du pipeline. |
| `./start.sh` ne trouve pas Python | Le script utilise `../../../venv`. Crée le venv à la racine (étape 1). |
| Port 8000 déjà pris | Change le port dans `start.sh` et pointe `NEXT_PUBLIC_API` dessus. |
