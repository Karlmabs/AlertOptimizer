"""
Workflow endpoints — each step of the rattrapage pipeline as an SSE stream.

The frontend reads stdout lines and renders them as live narration. A final
line of the form `RESULT: {...json...}` is parsed by the frontend and stored
as the step's structured result.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

ROOT = Path(__file__).resolve().parents[3] / "rattrapage"
DATA = ROOT / "data"
RESULTS = ROOT / "results"
SCRIPTS = ROOT / "scripts"
PY = os.environ.get("N2W_PYTHON") or str(Path(__file__).resolve().parents[3] / "venv" / "bin" / "python")
UI_DATA = ROOT / "ui" / "frontend" / "public" / "data"

router = APIRouter()


async def _emit(text: str):
    return {"event": "line", "data": json.dumps({"text": text})}


def _emit_sync(text: str):
    return {"event": "line", "data": json.dumps({"text": text})}


async def _result(payload: dict):
    return {"event": "line", "data": json.dumps({"text": f"RESULT: {json.dumps(payload)}"})}


async def _done(exit_code: int = 0):
    return {"event": "done", "data": json.dumps({"exit_code": exit_code, "script": ""})}


async def _run_subprocess(args: list[str], cwd: Path | str = ROOT) -> AsyncIterator[str]:
    """Yield stdout lines of a subprocess."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    assert proc.stdout is not None
    try:
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            yield line.decode("utf-8", errors="replace").rstrip("\n")
    finally:
        rc = await proc.wait()
        yield f"__EXIT__ {rc}"


# ──────────────────────────────────────────────────────────────
# Step 1 — Sources (clone OWASP + download Juliet)
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/sources")
async def step_sources():
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "sources"})}

        # Make sure the data directory exists — the user may have wiped everything
        # to test the "rebuild from scratch" flow. Without this, git clone's cwd
        # would be an invalid directory and subprocess.Popen raises FileNotFoundError.
        DATA.mkdir(parents=True, exist_ok=True)
        yield _emit_sync(f"📂 Préparation du dossier {DATA}")

        owasp_dir = DATA / "BenchmarkJava"
        juliet_dir = DATA / "juliet" / "Java"

        # OWASP
        if owasp_dir.exists():
            yield _emit_sync(f"✅ OWASP Benchmark déjà présent dans {owasp_dir}")
        else:
            yield _emit_sync("📥 Clonage de OWASP Benchmark Java depuis GitHub…")
            async for line in _run_subprocess([
                "git", "clone", "--depth", "1",
                "https://github.com/OWASP-Benchmark/BenchmarkJava.git",
                str(owasp_dir),
            ], cwd=DATA):
                if not line.startswith("__EXIT__"):
                    yield _emit_sync(line)

        # Juliet
        if juliet_dir.exists():
            yield _emit_sync(f"✅ Juliet déjà présent dans {juliet_dir}")
        else:
            (DATA / "juliet").mkdir(parents=True, exist_ok=True)
            zip_path = DATA / "juliet" / "juliet-java.zip"
            if not zip_path.exists():
                yield _emit_sync("📥 Téléchargement de Juliet Test Suite (~73 MB)…")
                async for line in _run_subprocess([
                    "curl", "-L", "--connect-timeout", "30",
                    "-o", str(zip_path),
                    "https://samate.nist.gov/SARD/downloads/test-suites/2017-10-01-juliet-test-suite-for-java-v1-3.zip",
                ], cwd=DATA):
                    if not line.startswith("__EXIT__") and "%" in line:
                        # Only emit lines with progress percentage to avoid spam
                        yield _emit_sync(line.split("\r")[-1])
            yield _emit_sync("📦 Décompression de l'archive…")
            async for line in _run_subprocess([
                "unzip", "-q", str(zip_path), "-d", str(DATA / "juliet"),
            ]):
                if not line.startswith("__EXIT__"):
                    yield _emit_sync(line)

        # Stats
        n_owasp = (
            len(list((owasp_dir / "src" / "main" / "java" / "org" / "owasp" / "benchmark" / "testcode").glob("*.java")))
            if (owasp_dir / "src").exists()
            else 0
        )
        n_juliet = (
            sum(1 for _ in (juliet_dir / "src" / "testcases").rglob("*.java"))
            if (juliet_dir / "src" / "testcases").exists()
            else 0
        )
        manifest = juliet_dir / "manifest.xml"
        yield _emit_sync(f"✅ {n_owasp} fichiers OWASP, {n_juliet} fichiers Juliet")
        yield await _result({
            "owasp_files": n_owasp,
            "juliet_files": n_juliet,
            "juliet_manifest": "OK" if manifest.exists() else "missing",
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 2 — Labels (parse expectedresults + manifest)
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/labels")
async def step_labels():
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "labels"})}
        yield _emit_sync("🏷️ Extraction des labels OWASP…")
        async for line in _run_subprocess([PY, "-u", str(SCRIPTS / "build_labels.py")]):
            if line.startswith("__EXIT__"):
                continue
            yield _emit_sync(line)

        # Quick stats from owasp_labels.csv
        import csv as _csv
        n_owasp = 0
        with open(RESULTS / "owasp_labels.csv") as f:
            for _ in _csv.DictReader(f):
                n_owasp += 1
        yield _emit_sync(f"✅ {n_owasp} labels OWASP extraits")

        yield _emit_sync("🏷️ Parsing du manifest Juliet (regex tolérant)…")
        # Use the same helper as build_dataset_juliet to parse the manifest
        try:
            sys.path.insert(0, str(SCRIPTS))
            from build_dataset_juliet import parse_manifest  # type: ignore
            flaws, cwes = parse_manifest(str(DATA / "juliet" / "Java" / "manifest.xml"))
            n_juliet_tests = len(flaws)
            n_with_flaws = sum(1 for v in flaws.values() if v)
            total_flaws = sum(len(v) for v in flaws.values())
        except Exception as e:
            yield _emit_sync(f"❌ Échec du parsing manifest : {e}")
            n_juliet_tests = 0
            n_with_flaws = 0
            total_flaws = 0
        yield _emit_sync(f"✅ {n_juliet_tests} tests Juliet indexés, dont {n_with_flaws} vulnérables")

        yield await _result({
            "n_owasp_labels": n_owasp,
            "n_juliet_tests": n_juliet_tests,
            "n_juliet_with_flaws": n_with_flaws,
            "total_flaw_lines": total_flaws,
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 3 — Scan SAST (Semgrep — heavy; cache by default)
# ──────────────────────────────────────────────────────────────

SEMGREP_CONFIGS = {
    "minimal": ["-c", "p/java"],
    "default": ["-c", "p/java", "-c", "p/owasp-top-ten", "-c", "p/security-audit"],
    "all": [
        "-c", "p/java",
        "-c", "p/owasp-top-ten",
        "-c", "p/security-audit",
        "-c", "p/findsecbugs",
        "-c", "p/cwe-top-25",
        "-c", "p/r2c-security-audit",
    ],
}


@router.get("/api/workflow/scan")
async def step_scan(rulesets: str = "all"):
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "scan"})}
        owasp_sarif = RESULTS / "semgrep_owasp_enriched.sarif.json"
        juliet_sarif = RESULTS / "semgrep_juliet.sarif.json"

        rule_args = SEMGREP_CONFIGS.get(rulesets, SEMGREP_CONFIGS["all"])

        if owasp_sarif.exists() and juliet_sarif.exists():
            yield _emit_sync("✅ Deux SARIF déjà présents en cache — skip du scan")
        else:
            for target_name, target_dir, sarif_out in [
                ("OWASP", DATA / "BenchmarkJava", owasp_sarif),
                ("Juliet", DATA / "juliet" / "Java" / "src", juliet_sarif),
            ]:
                if sarif_out.exists():
                    yield _emit_sync(f"✅ {target_name} SARIF déjà présent — skip")
                    continue
                yield _emit_sync(f"🐳 Lancement Docker semgrep sur {target_name}…")
                src_arg = (
                    "/src/src/main/java/org/owasp/benchmark/testcode/"
                    if target_name == "OWASP"
                    else "/src/testcases/"
                )
                args = [
                    "docker", "run", "--rm",
                    "-v", f"{target_dir}:/src:ro",
                    "-v", f"{RESULTS}:/out",
                    "returntocorp/semgrep:latest",
                    "semgrep", *rule_args,
                    "--sarif",
                    "--output", f"/out/{sarif_out.name}",
                    "--metrics", "off",
                    "--no-git-ignore",
                    src_arg,
                ]
                async for line in _run_subprocess(args):
                    if line.startswith("__EXIT__"):
                        continue
                    if "Findings:" in line or "Rules run" in line or "files with" in line:
                        yield _emit_sync(line.strip())

        # Read scan summary from SARIF
        def _read_summary(p: Path):
            try:
                with open(p) as f:
                    d = json.load(f)
                run = d["runs"][0]
                n = len(run.get("results", []))
                fired = len({r["ruleId"] for r in run.get("results", [])})
                rules = len(run.get("tool", {}).get("driver", {}).get("rules", []))
                return n, fired, rules
            except Exception:
                return 0, 0, 0

        n_o, fired_o, total_o = _read_summary(owasp_sarif)
        n_j, fired_j, total_j = _read_summary(juliet_sarif)
        yield _emit_sync(f"📊 OWASP : {n_o} alertes ({fired_o} règles déclenchées)")
        yield _emit_sync(f"📊 Juliet : {n_j} alertes ({fired_j} règles déclenchées)")
        yield await _result({
            "alerts_owasp": n_o,
            "alerts_juliet": n_j,
            "rules_total": max(total_o, total_j),
            "rules_fired": max(fired_o, fired_j),
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 4 — Dataset (build OWASP + Juliet labelled + merge)
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/dataset")
async def step_dataset():
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "dataset"})}
        for script in [
            "build_dataset_owasp_enriched.py",
            "build_dataset_juliet.py",
            "merge_datasets.py",
        ]:
            yield _emit_sync(f"▶︎ {script}")
            async for line in _run_subprocess([PY, "-u", str(SCRIPTS / script)]):
                if not line.startswith("__EXIT__"):
                    yield _emit_sync(line)

        # Read summary from real_dataset_v2.csv
        import csv as _csv
        from collections import Counter as _Counter
        n = 0; n_fp = 0
        by_rule: _Counter[str] = _Counter()
        with open(RESULTS / "real_dataset_v2.csv") as f:
            for row in _csv.DictReader(f):
                n += 1
                if row["is_fp"] in ("True", "1"):
                    n_fp += 1
                by_rule[row["rule_id"]] += 1
        yield _emit_sync(f"✅ Dataset unifié : {n} alertes, {n_fp} FP ({n_fp/n:.1%})")
        yield await _result({
            "n_alerts": n,
            "n_fp": n_fp,
            "n_tp": n - n_fp,
            "fp_rate": round(n_fp / max(n, 1), 4),
            "n_rules": len(by_rule),
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 5 — Features (description-only — features are extracted at training)
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/features")
async def step_features():
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "features"})}
        yield _emit_sync("📐 Description des 11 features extraites par alerte…")
        await asyncio.sleep(0.3)
        for name in [
            "rule.id (catégorielle, normalisée)",
            "level (catégorielle)",
            "source (owasp / juliet)",
            "tool.name (catégorielle)",
            "start_line (numérique normalisée)",
            "rank (numérique)",
            "occurrenceCount (numérique)",
            "severity (numérique)",
            "is_taint_rule (binaire, dérivée du nom de règle)",
            "cluster_fp_rate (DBSCAN)",
            "cluster_size (DBSCAN)",
        ]:
            yield _emit_sync(f"  · {name}")
            await asyncio.sleep(0.08)
        yield await _result({
            "n_sarif_features": 8,
            "n_context_features": 1,
            "n_dbscan_features": 2,
            "n_total_features": 11,
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 6 — Pipeline (DBSCAN + RF retrain with custom hyperparams)
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/pipeline")
async def step_pipeline(
    eps: float = 0.25,
    min_pts: int = 3,
    n_estimators: int = 50,
    max_depth: int = 14,
):
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "pipeline"})}
        yield _emit_sync(
            f"⚙️  Hyperparamètres : eps={eps}, min_pts={min_pts}, n_estimators={n_estimators}, max_depth={max_depth}"
        )

        # Call the in-process retrain function from main module
        sys.path.insert(0, str(SCRIPTS))
        from full_experiment_real import load_real_v2, stratified_split  # noqa
        from fast_helpers import chunked_dbscan, stratified_subsample, patch_random_forest  # noqa
        patch_random_forest()
        from alertoptimizer import (  # noqa
            RandomForest, assign_test_clusters, enrich_clusters,
            metrics, roc_auc, pr_auc, find_threshold,
        )
        import numpy as np  # noqa

        yield _emit_sync("📚 Chargement du dataset…")
        X, y, raw, meta = load_real_v2(add_context_feature=True)
        await asyncio.sleep(0)
        yield _emit_sync(f"   {len(y)} alertes, taux FP {np.mean(y):.1%}")

        lab_idx, pool_idx, te_idx = stratified_split(y, seed=42)
        X_lab, y_lab = X[lab_idx], y[lab_idx]
        X_te, y_te = X[te_idx], y[te_idx]
        X_pool, y_pool = X[pool_idx], y[pool_idx]

        yield _emit_sync(f"🪓 Stratified split : {len(lab_idx)} lab / {len(pool_idx)} pool / {len(te_idx)} test")
        db_sub = stratified_subsample(np.arange(len(lab_idx)), y_lab, 1500, seed=42)
        X_db = X_lab[db_sub][:, [0, 1, 2, 3]]
        y_db = y_lab[db_sub]
        yield _emit_sync(f"🔗 DBSCAN sur {len(db_sub)} points sous-échantillonnés…")
        t0 = time.time()
        cl_db = chunked_dbscan(X_db, eps=eps, min_pts=min_pts)
        n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
        yield _emit_sync(f"   {n_cl} clusters trouvés ({time.time()-t0:.1f} s)")

        cl_lab, _ = assign_test_clusters(X_lab[:, [0, 1, 2, 3]], X_db, cl_db, eps)
        cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, eps)
        cl_pool, _ = assign_test_clusters(X_pool[:, [0, 1, 2, 3]], X_db, cl_db, eps)
        _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
        X_lab_full, _ = enrich_clusters(X_lab, cl_lab, y_lab, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        X_pool_full, _ = enrich_clusters(X_pool, cl_pool, y_pool, n_cl, is_train=False, cl_fp_map=cl_fp_map)

        yield _emit_sync(f"🌳 Entraînement du Random Forest ({n_estimators} arbres, profondeur {max_depth})…")
        t0 = time.time()
        rf = RandomForest(n_estimators=n_estimators, max_depth=max_depth, random_state=42)
        rf.fit(X_lab_full, y_lab)
        yield _emit_sync(f"   entraînement en {time.time()-t0:.1f} s")
        y_prob = rf.predict_proba(X_te_full)
        y_prob_pool = rf.predict_proba(X_pool_full)
        best_t = find_threshold(y_te, y_prob, "f1", min_recall=0.85, min_red=0.50)
        m = metrics(y_te, y_prob, best_t)
        yield _emit_sync(
            f"🎯 Seuil F1-optimal {best_t} → F1={m['f1']:.3f} · Réd={m['reduction']:.1%}"
        )

        # ─── Side effect : write workbench_state.json + workbench_pool.json so the
        # deep-dive interactive tools (/threshold, /hyperparams, /alerts, /active-learning)
        # work after the wizard, without needing to call a separate cache script.
        yield _emit_sync("💾 Cache des artefacts pour les ateliers interactifs…")
        try:
            UI_DATA.mkdir(parents=True, exist_ok=True)
            roc_val = round(roc_auc(y_te, y_prob), 4)
            state = {
                "seed": 42,
                "n_rules": len(meta["rule_ids"]),
                "default": {
                    "eps": eps, "min_pts": min_pts,
                    "n_estimators": n_estimators, "max_depth": max_depth,
                    "threshold": best_t,
                    "metrics": m,
                    "roc_auc": roc_val,
                },
                "test": {
                    "n": int(len(y_te)),
                    "y_true": [int(v) for v in y_te.tolist()],
                    "y_prob": [round(float(v), 4) for v in y_prob.tolist()],
                    "indexes": [int(v) for v in te_idx.tolist()],
                },
                "n_train_labeled": int(len(y_lab)),
                "n_pool": int(len(y_pool)),
                "n_clusters_default": int(n_cl),
            }
            (UI_DATA / "workbench_state.json").write_text(json.dumps(state))

            pool_data = []
            for k, gi in enumerate(pool_idx):
                r = raw[int(gi)]
                pool_data.append({
                    "id": int(gi),
                    "rule_id": r["rule_id"],
                    "rule_category": r["rule_category"],
                    "source": r["source"],
                    "file_path": r["file_path"],
                    "start_line": int(r["start_line"]),
                    "y_true": int(y_pool[k]),
                    "y_prob": round(float(y_prob_pool[k]), 4),
                    "uncertainty": round(float(abs(y_prob_pool[k] - 0.5)), 4),
                })
            pool_data.sort(key=lambda d: d["uncertainty"])
            (UI_DATA / "workbench_pool.json").write_text(json.dumps(pool_data[:2000]))
            yield _emit_sync(f"   ✅ workbench_state.json + workbench_pool.json écrits ({UI_DATA})")
        except Exception as e:
            yield _emit_sync(f"   ⚠️ écriture des caches UI échouée : {e}")
            roc_val = round(roc_auc(y_te, y_prob), 4)

        yield await _result({
            "metrics": m,
            "roc_auc": roc_val,
            "pr_auc": round(pr_auc(y_te, y_prob), 4),
            "n_clusters": int(n_cl),
            "best_threshold": best_t,
            "oob_error": float(rf.oob_error) if rf.oob_error else None,
            "params": {"eps": eps, "min_pts": min_pts, "n_estimators": n_estimators, "max_depth": max_depth},
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 7 — Baselines
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/baselines")
async def step_baselines():
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "baselines"})}

        sys.path.insert(0, str(SCRIPTS))
        from full_experiment_real import load_real_v2, stratified_split, baseline_groupby_rule  # noqa
        from fast_helpers import chunked_dbscan, stratified_subsample, patch_random_forest  # noqa
        patch_random_forest()
        from alertoptimizer import (  # noqa
            RandomForest, assign_test_clusters, enrich_clusters,
            metrics, roc_auc, find_threshold,
        )
        import numpy as np  # noqa

        yield _emit_sync("📚 Chargement du dataset & split…")
        X, y, _, meta = load_real_v2(add_context_feature=True)
        lab_idx, _, te_idx = stratified_split(y, seed=42)
        X_lab, y_lab = X[lab_idx], y[lab_idx]
        X_te, y_te = X[te_idx], y[te_idx]

        # Re-train pipeline (same as step 6 defaults) for the comparison
        yield _emit_sync("🌳 Pipeline DBSCAN+RF (référence)…")
        db_sub = stratified_subsample(np.arange(len(lab_idx)), y_lab, 1500, seed=42)
        X_db = X_lab[db_sub][:, [0, 1, 2, 3]]
        y_db = y_lab[db_sub]
        cl_db = chunked_dbscan(X_db, eps=0.25, min_pts=3)
        n_cl = len(set(cl_db.tolist())) - (1 if -1 in cl_db else 0)
        cl_lab, _ = assign_test_clusters(X_lab[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
        cl_te, _ = assign_test_clusters(X_te[:, [0, 1, 2, 3]], X_db, cl_db, 0.25)
        _, cl_fp_map = enrich_clusters(X_db, cl_db, y_db, n_cl, is_train=True)
        X_lab_full, _ = enrich_clusters(X_lab, cl_lab, y_lab, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        X_te_full, _ = enrich_clusters(X_te, cl_te, y_te, n_cl, is_train=False, cl_fp_map=cl_fp_map)
        rf = RandomForest(n_estimators=50, max_depth=14, random_state=42)
        rf.fit(X_lab_full, y_lab)
        y_prob = rf.predict_proba(X_te_full)
        t_p = find_threshold(y_te, y_prob, "f1", min_recall=0.85, min_red=0.50)
        m_pipe = metrics(y_te, y_prob, t_p)
        yield _emit_sync(f"   F1={m_pipe['f1']:.3f}")

        yield _emit_sync("🌳 B2 — RF seul sans cluster features…")
        X_lab_nc = np.column_stack([X_lab, np.full(len(X_lab), 0.5), np.zeros(len(X_lab))])
        X_te_nc = np.column_stack([X_te, np.full(len(X_te), 0.5), np.zeros(len(X_te))])
        rf2 = RandomForest(n_estimators=50, max_depth=14, random_state=42)
        rf2.fit(X_lab_nc, y_lab)
        y_b2 = rf2.predict_proba(X_te_nc)
        t_b2 = find_threshold(y_te, y_b2, "f1", min_recall=0.85, min_red=0.50)
        m_b2 = metrics(y_te, y_b2, t_b2)
        yield _emit_sync(f"   F1={m_b2['f1']:.3f}")

        yield _emit_sync("📊 B4 — GROUP BY rule_id (avec smoothing de Laplace)…")
        y_b4 = baseline_groupby_rule(X_lab_full, y_lab, X_te_full, n_rules=len(meta["rule_ids"]))
        t_b4 = find_threshold(y_te, y_b4, "f1")
        m_b4 = metrics(y_te, y_b4, t_b4)
        yield _emit_sync(f"   F1={m_b4['f1']:.3f}")

        yield _emit_sync("🎲 B0 — random uniforme…")
        rng = np.random.RandomState(42)
        y_b0 = rng.random(len(y_te))
        m_b0 = metrics(y_te, y_b0, find_threshold(y_te, y_b0, "f1"))
        yield _emit_sync(f"   F1={m_b0['f1']:.3f}")

        delta = round(m_pipe["f1"] - m_b4["f1"], 4)
        yield _emit_sync(f"🚀 ML bat GROUP BY de {delta:+.3f} pts F1")
        yield await _result({
            "pipeline": m_pipe,
            "rf_only": m_b2,
            "groupby": m_b4,
            "random": m_b0,
            "delta_vs_groupby": delta,
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 8 — Active Learning (5 cycles, perfect + noisy)
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/active-learning")
async def step_active_learning():
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "active-learning"})}

        sys.path.insert(0, str(SCRIPTS))
        from full_experiment_real import (
            load_real_v2, stratified_split, run_pipeline_seed, active_learning_real,
        )  # noqa
        from fast_helpers import patch_random_forest  # noqa
        patch_random_forest()
        import numpy as np  # noqa

        yield _emit_sync("📚 Préparation du pipeline initial…")
        X, y, _, meta = load_real_v2(add_context_feature=True)
        r1 = run_pipeline_seed(42, X, y, len(meta["rule_ids"]))
        r1["seed"] = 42
        f1_start = r1["metrics"]["f1"]
        yield _emit_sync(f"   F1 de départ : {f1_start:.3f}")

        yield _emit_sync("🧪 AL — oracle parfait (5 cycles × 150 requêtes)…")
        al_p = active_learning_real(r1, cycles=5, feedback=150, noise=0.0)
        for c in al_p[1:]:
            yield _emit_sync(f"   cycle {c['cycle']} → F1={c['f1']:.3f}")
        delta_p = round(al_p[-1]["f1"] - al_p[0]["f1"], 4)

        yield _emit_sync("🧪 AL — oracle bruité 10 %…")
        al_n = active_learning_real(r1, cycles=5, feedback=150, noise=0.10)
        for c in al_n[1:]:
            yield _emit_sync(f"   cycle {c['cycle']} → F1={c['f1']:.3f}")
        delta_n = round(al_n[-1]["f1"] - al_n[0]["f1"], 4)

        yield _emit_sync(f"🎯 Δ parfait = {delta_p:+.3f} · Δ bruité = {delta_n:+.3f}")
        yield await _result({
            "perfect": {
                "f1_start": f1_start,
                "f1_end": al_p[-1]["f1"],
                "delta": delta_p,
            },
            "noisy": {
                "f1_start": f1_start,
                "f1_end": al_n[-1]["f1"],
                "delta": delta_n,
            },
        })
        yield await _done(0)

    return EventSourceResponse(gen())


# ──────────────────────────────────────────────────────────────
# Step 9 — Grid search (calls the existing script via SSE)
# Already exposed at /api/run/grid-search; we re-expose under workflow path
# for symmetry, with parsed RESULT.
# ──────────────────────────────────────────────────────────────

@router.get("/api/workflow/grid-search")
async def step_grid_search():
    """Run the grid search script, then parse the CSV outputs to extract the
    best hyperparameter combination — both for DBSCAN and for the RF.
    """
    async def gen():
        yield {"event": "start", "data": json.dumps({"step": "grid-search"})}
        yield _emit_sync("▶︎ scripts/grid_search.py (105 configurations en parallèle)…")

        async for line in _run_subprocess([PY, "-u", str(SCRIPTS / "grid_search.py")]):
            if line.startswith("__EXIT__"):
                continue
            yield _emit_sync(line)

        # Parse the resulting CSVs to find the best combination
        import csv as _csv
        best_db = {"eps": 0.25, "min_pts": 3, "f1": 0.0}
        best_rf = {"n_estimators": 50, "max_depth": 14, "f1": 0.0}
        v6_db = {"f1": 0.0}
        v6_rf = {"f1": 0.0}

        try:
            db_csv = RESULTS / "hyperparam_dbscan.csv"
            with open(db_csv) as f:
                for row in _csv.DictReader(f):
                    f1 = float(row["f1"])
                    eps = float(row["eps"])
                    mp = int(float(row["min_pts"]))
                    if f1 > best_db["f1"]:
                        best_db = {"eps": eps, "min_pts": mp, "f1": f1}
                    if abs(eps - 0.25) < 1e-6 and mp == 3:
                        v6_db = {"f1": f1}
        except Exception as e:
            yield _emit_sync(f"⚠️ Lecture hyperparam_dbscan.csv : {e}")

        try:
            rf_csv = RESULTS / "hyperparam_rf.csv"
            with open(rf_csv) as f:
                for row in _csv.DictReader(f):
                    f1 = float(row["f1"])
                    ne = int(float(row["n_estimators"]))
                    md = int(float(row["max_depth"]))
                    if f1 > best_rf["f1"]:
                        best_rf = {"n_estimators": ne, "max_depth": md, "f1": f1}
                    if ne == 50 and md == 14:
                        v6_rf = {"f1": f1}
        except Exception as e:
            yield _emit_sync(f"⚠️ Lecture hyperparam_rf.csv : {e}")

        best_f1 = max(best_db["f1"], best_rf["f1"])
        v6_f1 = max(v6_db["f1"], v6_rf["f1"])

        yield _emit_sync(
            f"🏆 Best DBSCAN : ε={best_db['eps']}, MinPts={best_db['min_pts']} → F1={best_db['f1']:.3f}"
        )
        yield _emit_sync(
            f"🏆 Best RF : n_estimators={best_rf['n_estimators']}, max_depth={best_rf['max_depth']} → F1={best_rf['f1']:.3f}"
        )
        yield _emit_sync(
            f"📐 Mémoire v6 (ε=0.25, n=50, d=14) → F1={v6_f1:.3f}"
        )

        yield await _result({
            "best_f1": round(best_f1, 4),
            "v6_f1": round(v6_f1, 4),
            "delta": round(best_f1 - v6_f1, 4),
            "total_combos": 42 + 63,
            "best_eps": best_db["eps"],
            "best_min_pts": best_db["min_pts"],
            "best_n_estimators": best_rf["n_estimators"],
            "best_max_depth": best_rf["max_depth"],
        })
        yield await _done(0)

    return EventSourceResponse(gen())
