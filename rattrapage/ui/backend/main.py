#!/usr/bin/env python3
"""
FastAPI backend for the AlertOptimizer rattrapage UI (workbench mode).

Exposes endpoints that the Next.js workbench uses to interactively explore
the dataset, retrain the RF with custom hyperparameters, inspect the Java
source code of any alert, and run an active-learning loop.

Run:
  cd rattrapage/ui/backend
  ./start.sh
"""
from __future__ import annotations

import asyncio
import csv
import json
import os
import sys
import threading
from collections import Counter
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

ROOT = Path(__file__).resolve().parents[3] / "rattrapage"
RESULTS = ROOT / "results"
SCRIPTS = ROOT / "scripts"
DATA = ROOT / "data"
PY = os.environ.get("N2W_PYTHON") or str(Path(__file__).resolve().parents[3] / "venv" / "bin" / "python")

# Make our experiment helpers importable
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # for `alertoptimizer`
sys.path.insert(0, str(SCRIPTS))                              # for fast_helpers etc.

# Lazy imports — heavy NumPy stuff only when needed
_state_lock = threading.Lock()
_dataset_cache: dict = {}


def _load_dataset_once():
    """Load the unified dataset once per process, cache in memory."""
    if "X" in _dataset_cache:
        return _dataset_cache
    from full_experiment_real import load_real_v2, stratified_split  # noqa
    from fast_helpers import patch_random_forest  # noqa
    patch_random_forest()
    X, y, raw, meta = load_real_v2(add_context_feature=True)
    lab_idx, pool_idx, te_idx = stratified_split(y, seed=42)
    _dataset_cache.update(
        X=X, y=y, raw=raw, meta=meta,
        lab_idx=lab_idx, pool_idx=pool_idx, te_idx=te_idx,
    )
    return _dataset_cache


# ============================================================
# App + CORS
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    yield


app = FastAPI(title="AlertOptimizer Workbench API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Workflow endpoints (one per step of the rattrapage pipeline)
from workflow import router as workflow_router  # noqa: E402
app.include_router(workflow_router)


# ============================================================
# Health + static info
# ============================================================

@app.get("/api/health")
def health():
    return {
        "ok": True,
        "results_dir": str(RESULTS),
        "scripts_dir": str(SCRIPTS),
        "has_full_experiment": (RESULTS / "full_experiment_results.json").exists(),
        "has_dataset_v2": (RESULTS / "real_dataset_v2.csv").exists(),
        "has_state_cache": (ROOT / "ui" / "frontend" / "public" / "data" / "workbench_state.json").exists(),
    }


@app.get("/api/results")
def results():
    p = RESULTS / "full_experiment_results.json"
    if not p.exists():
        raise HTTPException(404, "full_experiment_results.json not found")
    with open(p) as f:
        return json.load(f)


@app.get("/api/dataset-stats")
def dataset_stats():
    p = RESULTS / "real_dataset_v2.csv"
    if not p.exists():
        raise HTTPException(404, "real_dataset_v2.csv not found")
    n = 0; n_fp = 0
    by_source: Counter = Counter()
    by_rule: Counter = Counter()
    by_level: Counter = Counter()
    by_category: Counter = Counter()
    with open(p) as f:
        for row in csv.DictReader(f):
            n += 1
            if row["is_fp"] in ("True", "1"):
                n_fp += 1
            by_source[row["source"]] += 1
            by_rule[row["rule_id"]] += 1
            by_level[row["level"]] += 1
            by_category[row.get("rule_category") or "other"] += 1
    return {
        "n_alerts": n,
        "n_fp": n_fp,
        "n_tp": n - n_fp,
        "fp_rate": round(n_fp / max(n, 1), 4),
        "n_unique_rules": len(by_rule),
        "by_source": dict(by_source),
        "by_level": dict(by_level),
        "by_category": dict(by_category),
        "top_rules": [
            {"rule_id": rid, "count": c} for rid, c in by_rule.most_common(15)
        ],
    }


# ============================================================
# /api/alerts — paginated + filtered list (Alert Explorer)
# ============================================================

@app.get("/api/alerts")
def alerts(
    offset: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    rule: Optional[str] = None,
    category: Optional[str] = None,
    source: Optional[str] = None,
    fp: Optional[str] = None,  # "true" / "false"
    pred: Optional[str] = None,  # "tp" / "fp" / "fn" / "tn"
    threshold: float = 0.45,
    sort: str = "uncertainty",  # uncertainty | id | rule | proba
):
    """Return a paginated, filtered slice of the test-set alerts."""
    cache = _load_dataset_once()
    raw = cache["raw"]
    te_idx = cache["te_idx"]

    # Need y_prob for the test set — read from the cached state JSON
    state_path = ROOT / "ui" / "frontend" / "public" / "data" / "workbench_state.json"
    if not state_path.exists():
        raise HTTPException(
            503,
            "workbench_state.json not found — run wizard step 6 (Pipeline) first.",
        )
    with open(state_path) as f:
        st = json.load(f)
    y_true = st["test"]["y_true"]
    y_prob = st["test"]["y_prob"]
    indexes = st["test"]["indexes"]

    rows = []
    for k, gi in enumerate(indexes):
        r = raw[gi]
        rows.append({
            "id": gi,
            "k": k,
            "rule_id": r["rule_id"],
            "rule_category": r["rule_category"],
            "level": r["level"],
            "source": r["source"],
            "file_path": r["file_path"],
            "start_line": int(r["start_line"]),
            "test_cwe": r.get("test_cwe", ""),
            "y_true": y_true[k],
            "y_prob": y_prob[k],
            "y_pred": 1 if y_prob[k] >= threshold else 0,
        })

    # Filters
    def keep(a):
        if q and q.lower() not in a["rule_id"].lower() and q.lower() not in a["file_path"].lower():
            return False
        if rule and rule != a["rule_id"]:
            return False
        if category and category != a["rule_category"]:
            return False
        if source and source != a["source"]:
            return False
        if fp is not None:
            want = fp.lower() == "true"
            if (a["y_true"] == 1) != want:
                return False
        if pred is not None:
            actual_fp = a["y_true"] == 1
            pred_fp = a["y_pred"] == 1
            kind = (
                "tp" if (not actual_fp and not pred_fp)
                else "fn" if (not actual_fp and pred_fp)
                else "fp" if (actual_fp and not pred_fp)
                else "tn"
            )
            if pred.lower() != kind:
                return False
        return True

    filtered = [a for a in rows if keep(a)]

    # Sort
    if sort == "uncertainty":
        filtered.sort(key=lambda a: abs(a["y_prob"] - 0.5))
    elif sort == "id":
        filtered.sort(key=lambda a: a["id"])
    elif sort == "rule":
        filtered.sort(key=lambda a: (a["rule_id"], a["y_prob"]))
    elif sort == "proba":
        filtered.sort(key=lambda a: -a["y_prob"])

    total = len(filtered)
    page = filtered[offset : offset + limit]
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": page,
    }


@app.get("/api/alert/{alert_id}/source")
def alert_source(alert_id: int):
    """Return the surrounding Java source code for an alert."""
    cache = _load_dataset_once()
    raw = cache["raw"]
    if alert_id < 0 or alert_id >= len(raw):
        raise HTTPException(404, "alert id out of range")
    rec = raw[alert_id]
    file_uri = rec["file_path"]
    # In the SARIF, the path looks like "/src/src/main/java/..." (OWASP)
    # or "/src/testcases/CWE89_..." (Juliet). Translate to the local clone:
    if rec["source"] == "owasp_bench":
        rel = file_uri.replace("/src/", "")
        absolute = DATA / "BenchmarkJava" / rel
    elif rec["source"] == "juliet":
        rel = file_uri.replace("/src/", "")
        absolute = DATA / "juliet" / "Java" / "src" / rel
    else:
        raise HTTPException(404, f"unknown source: {rec['source']}")

    if not absolute.exists():
        raise HTTPException(
            404,
            f"source file not found locally — re-clone OWASP Benchmark / re-download Juliet. "
            f"expected at {absolute}",
        )

    text = absolute.read_text(encoding="utf-8", errors="replace")
    return {
        "alert_id": alert_id,
        "absolute_path": str(absolute),
        "relative_path": file_uri,
        "start_line": int(rec["start_line"]),
        "rule_id": rec["rule_id"],
        "level": rec["level"],
        "is_fp": rec["is_fp"] in ("True", "1", True),
        "test_cwe": rec.get("test_cwe", ""),
        "test_category": rec.get("test_category", ""),
        "source": rec["source"],
        "lines": text.split("\n"),
    }


# ============================================================
# /api/retrain — custom hyperparameters (Hyperparam Playground)
# ============================================================

class RetrainBody(BaseModel):
    eps: float = Field(0.25, ge=0.05, le=0.6)
    min_pts: int = Field(3, ge=2, le=30)
    n_estimators: int = Field(50, ge=5, le=200)
    max_depth: int = Field(14, ge=2, le=40)
    dbscan_max_labeled: int = Field(1500, ge=200, le=3000)


@app.post("/api/retrain")
def retrain(body: RetrainBody):
    """Retrain the pipeline with custom hyperparameters and return updated metrics."""
    from alertoptimizer import (  # noqa: E402
        RandomForest, assign_test_clusters, enrich_clusters,
        metrics, roc_auc, pr_auc, find_threshold,
    )
    from fast_helpers import chunked_dbscan, stratified_subsample  # noqa: E402

    cache = _load_dataset_once()
    X = cache["X"]
    y = cache["y"]
    lab_idx = cache["lab_idx"]
    te_idx = cache["te_idx"]

    with _state_lock:
        X_lab, y_lab = X[lab_idx], y[lab_idx]
        X_te, y_te = X[te_idx], y[te_idx]
        db_sub = stratified_subsample(
            np.arange(len(lab_idx)), y_lab, body.dbscan_max_labeled, seed=42
        )
        X_db = X_lab[db_sub][:, [0, 1, 2, 3]]
        y_db = y_lab[db_sub]
        cl_db = chunked_dbscan(X_db, eps=body.eps, min_pts=body.min_pts)
        n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
        noise_pct = float(np.mean(cl_db == -1))
        cl_lab, _ = assign_test_clusters(X_lab[:, [0, 1, 2, 3]], X_db, cl_db, body.eps)
        cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, body.eps)
        _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
        X_lab_full, _ = enrich_clusters(X_lab, cl_lab, y_lab, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        rf = RandomForest(
            n_estimators=body.n_estimators,
            max_depth=body.max_depth,
            random_state=42,
        )
        rf.fit(X_lab_full, y_lab)
        y_prob = rf.predict_proba(X_te_full)

    best_t = find_threshold(y_te, y_prob, "f1", min_recall=0.85, min_red=0.50)
    m = metrics(y_te, y_prob, best_t)

    # Threshold sweep (sparse, for the slider chart)
    sweep = []
    for t in np.arange(0.1, 0.91, 0.05):
        t_ = round(float(t), 2)
        mm = metrics(y_te, y_prob, t_)
        sweep.append({"threshold": t_, **{k: mm[k] for k in ("precision", "recall", "f1", "reduction")}})

    return {
        "params": body.model_dump(),
        "n_clusters": n_cl,
        "noise_pct": round(noise_pct, 4),
        "best_threshold": best_t,
        "metrics": m,
        "roc_auc": round(roc_auc(y_te, y_prob), 4),
        "pr_auc": round(pr_auc(y_te, y_prob), 4),
        "oob_error": round(float(rf.oob_error), 4) if rf.oob_error else None,
        "threshold_sweep": sweep,
        # Lightweight subset of y_prob so the UI can update its confusion-matrix-by-threshold slider
        # without needing yet another call. Limit to first 5000 for payload size.
        "y_prob_head": [round(float(v), 4) for v in y_prob[:5000].tolist()],
        "y_true_head": [int(v) for v in y_te[:5000].tolist()],
    }


# ============================================================
# /api/active-learning/step — one AL cycle (Active Learning Lab)
# ============================================================

class ALStepBody(BaseModel):
    labels: dict[int, int]  # alert_id (global) → 0 (TP) or 1 (FP) provided by user


@app.post("/api/active-learning/step")
def active_learning_step(body: ALStepBody):
    """
    Given user-provided labels for N pool alerts, retrain the RF on
    the augmented labeled set and return updated metrics + new pool uncertainty.
    """
    from alertoptimizer import (  # noqa: E402
        RandomForest, assign_test_clusters, enrich_clusters,
        metrics, roc_auc, find_threshold,
    )
    from fast_helpers import chunked_dbscan, stratified_subsample  # noqa: E402

    cache = _load_dataset_once()
    X = cache["X"]
    y = cache["y"]
    lab_idx = cache["lab_idx"]
    pool_idx = cache["pool_idx"]
    te_idx = cache["te_idx"]

    with _state_lock:
        added_ids = np.array([int(k) for k in body.labels.keys()], dtype=int)
        added_y = np.array([int(v) for v in body.labels.values()], dtype=int)

        # Augment labeled set
        new_lab_idx = np.concatenate([lab_idx, added_ids])
        new_lab_y = np.concatenate([y[lab_idx], added_y])

        # Remove labeled-from-pool ids
        pool_keep = np.setdiff1d(pool_idx, added_ids, assume_unique=False)

        X_lab = X[new_lab_idx]
        X_te, y_te = X[te_idx], y[te_idx]

        db_sub = stratified_subsample(np.arange(len(new_lab_idx)), new_lab_y, 1500, seed=42)
        X_db = X_lab[db_sub][:, [0, 1, 2, 3]]
        y_db = new_lab_y[db_sub]
        cl_db = chunked_dbscan(X_db, eps=0.25, min_pts=3)
        n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
        cl_lab, _ = assign_test_clusters(X_lab[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
        cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
        _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
        X_lab_full, _ = enrich_clusters(X_lab, cl_lab, new_lab_y, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)

        rf = RandomForest(n_estimators=50, max_depth=14, random_state=42)
        rf.fit(X_lab_full, new_lab_y)
        y_prob = rf.predict_proba(X_te_full)
        best_t = find_threshold(y_te, y_prob, "f1", min_recall=0.85, min_red=0.50)
        m = metrics(y_te, y_prob, best_t)

        # New pool uncertainty (top 20 most uncertain) — for the UI to re-pick the next batch
        X_pool = X[pool_keep]
        cl_pool, _ = assign_test_clusters(X_pool[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
        X_pool_full, _ = enrich_clusters(X_pool, cl_pool, y[pool_keep], n_cl,
                                          is_train=False, cl_fp_map=cl_fp_map)
        p_pool = rf.predict_proba(X_pool_full)
        uncertainty = np.abs(p_pool - 0.5)
        top_ix = np.argsort(uncertainty)[:20]
        new_pool = [
            {
                "id": int(pool_keep[i]),
                "y_prob": round(float(p_pool[i]), 4),
                "uncertainty": round(float(uncertainty[i]), 4),
            }
            for i in top_ix
        ]

    return {
        "n_new_labels": len(body.labels),
        "n_train_after": int(len(new_lab_idx)),
        "n_pool_after": int(len(pool_keep)),
        "best_threshold": best_t,
        "metrics": m,
        "roc_auc": round(roc_auc(y_te, y_prob), 4),
        "next_uncertain": new_pool,
    }


# ============================================================
# SSE streams (unchanged from previous version)
# ============================================================

async def _stream_subprocess(script_name: str) -> AsyncIterator[dict]:
    script = SCRIPTS / script_name
    if not script.exists():
        yield {"event": "error", "data": f"script not found: {script_name}"}
        return
    proc = await asyncio.create_subprocess_exec(
        PY, "-u", str(script),
        cwd=str(ROOT),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    yield {"event": "start", "data": json.dumps({"script": script_name})}
    assert proc.stdout is not None
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").rstrip("\n")
            yield {"event": "line", "data": json.dumps({"text": decoded})}
    except asyncio.CancelledError:
        proc.kill()
        raise
    rc = await proc.wait()
    yield {"event": "done", "data": json.dumps({"exit_code": rc, "script": script_name})}


@app.get("/api/run/experiment")
async def run_experiment():
    return EventSourceResponse(_stream_subprocess("full_experiment_real.py"))


@app.get("/api/run/grid-search")
async def run_grid_search():
    return EventSourceResponse(_stream_subprocess("grid_search.py"))


@app.get("/api/run/merge-datasets")
async def run_merge():
    return EventSourceResponse(_stream_subprocess("merge_datasets.py"))


@app.get("/api/run/lodo")
async def run_lodo():
    """LODO (cross-dataset generalization) + ablation sans rule.id. ~90 s."""
    return EventSourceResponse(_stream_subprocess("lodo_ablation.py"))


@app.get("/api/run/al-cross")
async def run_al_cross():
    """Active learning cross-dataset (adaptation) — uncertainty vs random, 3 seeds. ~140 s."""
    return EventSourceResponse(_stream_subprocess("al_cross_dataset.py"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
