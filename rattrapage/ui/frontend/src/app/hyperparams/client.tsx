"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Loader2, AlertTriangle } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ParamSlider } from "@/components/param-slider";
import { MetricTile } from "@/components/metric-tile";
import { ConfusionCells } from "@/components/confusion-cells";
import { CHART_COLORS, tooltipStyle, axisStyle } from "@/components/chart-theme";
import { retrain, type RetrainResponse, type WorkbenchState } from "@/lib/api";

const DEFAULT_PARAMS = {
  eps: 0.25,
  min_pts: 3,
  n_estimators: 50,
  max_depth: 14,
};

export function HyperparamsClient({
  defaults,
}: {
  defaults: WorkbenchState["default"];
}) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [result, setResult] = useState<RetrainResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function train() {
    setBusy(true);
    setError(null);
    setElapsedMs(null);
    const t0 = performance.now();
    try {
      const r = await retrain(params);
      setResult(r);
      setElapsedMs(performance.now() - t0);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Le backend FastAPI semble offline. Lance ./rattrapage/ui/backend/start.sh.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const r = result;
  const m = r?.metrics;
  const def = defaults.metrics;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="glass border-gradient rounded-(--radius) p-6 md:p-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6">
          <ParamSlider
            label="ε (eps)"
            description="Rayon de voisinage DBSCAN (4 features contextuelles)."
            value={params.eps}
            defaultValue={DEFAULT_PARAMS.eps}
            min={0.05}
            max={0.6}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(eps) => setParams({ ...params, eps })}
            disabled={busy}
          />
          <ParamSlider
            label="MinPts"
            description="Nombre min. de voisins pour être point core."
            value={params.min_pts}
            defaultValue={DEFAULT_PARAMS.min_pts}
            min={2}
            max={30}
            step={1}
            onChange={(min_pts) => setParams({ ...params, min_pts })}
            disabled={busy}
          />
          <ParamSlider
            label="n_estimators"
            description="Nombre d'arbres dans la forêt aléatoire."
            value={params.n_estimators}
            defaultValue={DEFAULT_PARAMS.n_estimators}
            min={5}
            max={200}
            step={5}
            onChange={(n_estimators) => setParams({ ...params, n_estimators })}
            disabled={busy}
          />
          <ParamSlider
            label="max_depth"
            description="Profondeur max de chaque arbre."
            value={params.max_depth}
            defaultValue={DEFAULT_PARAMS.max_depth}
            min={2}
            max={40}
            step={1}
            onChange={(max_depth) => setParams({ ...params, max_depth })}
            disabled={busy}
          />
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-(--color-fg-muted)">
            Configuration courante :{" "}
            <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-(--color-bg-elevated)">
              eps={params.eps.toFixed(2)}, min_pts={params.min_pts}, n_estimators=
              {params.n_estimators}, max_depth={params.max_depth}
            </code>
          </div>
          <button
            onClick={train}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-(--color-fg) text-(--color-bg) font-medium text-sm transition-colors hover:bg-(--color-accent) disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {busy ? "Entraînement…" : "Entraîner le modèle"}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass border border-(--color-danger)/40 rounded-(--radius) p-5 flex items-start gap-3 text-sm text-(--color-fg-muted)">
          <AlertTriangle className="w-5 h-5 text-(--color-danger) shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-(--color-danger)">Erreur</div>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {r && m && (
          <motion.div
            key={JSON.stringify(params)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            {/* Metric tiles */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-3 flex items-center gap-3">
                <span>Résultat — {elapsedMs ? `${(elapsedMs / 1000).toFixed(1)} s` : "—"}</span>
                <span>·</span>
                <span>{r.n_clusters} clusters · seuil F1-opt {r.best_threshold.toFixed(3)}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricTile label="F1" value={m.f1} accent baseline={def.f1} />
                <MetricTile label="ROC-AUC" value={r.roc_auc} accent baseline={defaults.roc_auc} />
                <MetricTile label="Précision" value={m.precision} baseline={def.precision} />
                <MetricTile label="Rappel" value={m.recall} baseline={def.recall} />
                <MetricTile label="Réduction" value={m.reduction * 100} suffix=" %" decimals={1} baseline={def.reduction * 100} />
                <MetricTile label="OOB error" value={r.oob_error ?? 0} baseline={undefined} />
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              {/* Confusion matrix */}
              <div className="glass border-gradient rounded-(--radius) p-6">
                <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-4">
                  Matrice de confusion · seuil {r.best_threshold.toFixed(3)}
                </div>
                <ConfusionCells
                  tp={m.tp}
                  fn={m.fn}
                  fp_kept={m.fp_kept}
                  tn={m.tn}
                  animateKey={JSON.stringify(params)}
                />
              </div>

              {/* Threshold sweep */}
              <div className="glass border-gradient rounded-(--radius) p-6">
                <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-2">
                  F1 / Précision / Rappel par seuil
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={r.threshold_sweep} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" />
                      <XAxis dataKey="threshold" {...axisStyle} tickFormatter={(v) => v.toFixed(2)} />
                      <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axisStyle} />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(3) : String(v))}
                        labelFormatter={(l) => `t = ${Number(l).toFixed(2)}`}
                      />
                      <Line type="monotone" dataKey="precision" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} animationDuration={500} />
                      <Line type="monotone" dataKey="recall" stroke={CHART_COLORS.info} strokeWidth={2} dot={false} animationDuration={500} />
                      <Line type="monotone" dataKey="f1" stroke={CHART_COLORS.warn} strokeWidth={2} dot={false} animationDuration={500} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-(--color-fg-muted)">
                  <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-(--color-accent)" /> Précision</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-(--color-info)" /> Rappel</span>
                  <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-(--color-warn)" /> F1</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!r && !busy && (
        <div className="glass border-gradient rounded-(--radius) p-7 text-center text-sm text-(--color-fg-muted)">
          Configure les sliders et clique sur <strong className="text-(--color-fg)">Entraîner le modèle</strong>{" "}
          pour relancer l&apos;intégralité du pipeline DBSCAN + RF sur le dataset réel.
        </div>
      )}
    </div>
  );
}
