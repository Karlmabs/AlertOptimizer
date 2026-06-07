"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceDot,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import { MetricTile } from "@/components/metric-tile";
import { ConfusionCells } from "@/components/confusion-cells";
import { CHART_COLORS, tooltipStyle, axisStyle } from "@/components/chart-theme";
import { metricsAt, type WorkbenchState } from "@/lib/api";

export function ThresholdClient({ state }: { state: WorkbenchState }) {
  const { y_prob, y_true } = state.test;
  const defaultT = state.default.threshold;
  const [threshold, setThreshold] = useState(defaultT);

  // Recompute current metrics from threshold (client-side, instant)
  const m = useMemo(() => metricsAt(y_prob, y_true, threshold), [y_prob, y_true, threshold]);

  // Pre-compute the threshold sweep used for the ROC + sliders preview
  const sweep = useMemo(() => {
    const out: {
      threshold: number;
      f1: number;
      precision: number;
      recall: number;
      reduction: number;
      fpr: number;
      tpr: number;
    }[] = [];
    for (let t = 0.02; t <= 0.98; t += 0.01) {
      const mm = metricsAt(y_prob, y_true, t);
      const fpr = mm.fp_kept / Math.max(mm.fp_kept + mm.tn, 1);
      out.push({
        threshold: +t.toFixed(2),
        f1: mm.f1,
        precision: mm.precision,
        recall: mm.recall,
        reduction: mm.reduction,
        fpr,
        tpr: mm.recall,
      });
    }
    return out;
  }, [y_prob, y_true]);

  // Current operating point on ROC
  const currentRocPoint = useMemo(() => {
    const fpr = m.fp_kept / Math.max(m.fp_kept + m.tn, 1);
    return { fpr, tpr: m.recall };
  }, [m]);

  return (
    <div className="space-y-6">
      {/* Slider + key metrics */}
      <div className="glass border-gradient rounded-(--radius) p-6 md:p-8">
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
              Seuil de décision
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <motion.div
                key={threshold}
                initial={{ opacity: 0.7, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
                className="text-5xl md:text-6xl font-semibold tabular-nums num-gradient"
              >
                {threshold.toFixed(2)}
              </motion.div>
              <button
                onClick={() => setThreshold(defaultT)}
                className="text-xs text-(--color-fg-muted) hover:text-(--color-fg) inline-flex items-center gap-1.5"
                title={`Restaurer le seuil F1-optimal (${defaultT})`}
              >
                <RotateCcw className="w-3 h-3" /> Reset (F1-optimal)
              </button>
            </div>
            <div className="mt-2 text-xs text-(--color-fg-muted)">
              Toute alerte au-dessus du seuil est filtrée ; en-dessous, remontée à
              l&apos;analyste. Bouge le slider — tout l&apos;écran s&apos;ajuste en
              direct.
            </div>
          </div>
          <div className="flex gap-3">
            <Preset label="Strict 0,30" v={0.3} cur={threshold} onSet={setThreshold} />
            <Preset label="F1-opt." v={defaultT} cur={threshold} onSet={setThreshold} />
            <Preset label="Sécurité 0,70" v={0.7} cur={threshold} onSet={setThreshold} />
            <Preset label="Agressif 0,85" v={0.85} cur={threshold} onSet={setThreshold} />
          </div>
        </div>

        <div className="mt-6">
          <input
            type="range"
            min={0.01}
            max={0.99}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full slider"
          />
          <div className="mt-2 flex justify-between text-[10px] font-mono text-(--color-fg-subtle)">
            <span>0,01 · garde tout</span>
            <span>0,50</span>
            <span>0,99 · filtre tout</span>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricTile label="F1" value={m.f1} accent baseline={state.default.metrics.f1} />
        <MetricTile label="Précision" value={m.precision} baseline={state.default.metrics.precision} />
        <MetricTile label="Rappel" value={m.recall} baseline={state.default.metrics.recall} />
        <MetricTile label="Réduction" value={m.reduction * 100} suffix=" %" decimals={1} baseline={state.default.metrics.reduction * 100} />
        <MetricTile label="VP manquées" value={m.fn} decimals={0} baseline={state.default.metrics.fn} higherBetter={false} />
      </div>

      {/* Confusion + Curves */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass border-gradient rounded-(--radius) p-6 md:p-7">
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-4">
            Matrice de confusion · {state.test.n.toLocaleString("fr-FR")} alertes de test
          </div>
          <ConfusionCells tp={m.tp} fn={m.fn} fp_kept={m.fp_kept} tn={m.tn} animateKey={threshold} />
        </div>

        <div className="glass border-gradient rounded-(--radius) p-6 md:p-7">
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-2">
            Précision / Rappel par seuil
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sweep} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" />
                <XAxis dataKey="threshold" {...axisStyle} tickFormatter={(v) => v.toFixed(2)} />
                <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} {...axisStyle} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(3) : String(v))}
                  labelFormatter={(l) => `t = ${Number(l).toFixed(2)}`}
                />
                <Line type="monotone" dataKey="precision" stroke={CHART_COLORS.accent} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="recall" stroke={CHART_COLORS.info} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="f1" stroke={CHART_COLORS.warn} strokeWidth={2} dot={false} />
                <ReferenceLine x={threshold} stroke={CHART_COLORS.fg} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend />
        </div>
      </div>

      {/* ROC */}
      <div className="glass border-gradient rounded-(--radius) p-6 md:p-7">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
              Courbe ROC · point de fonctionnement actuel
            </div>
            <div className="text-base font-semibold mt-1">
              FPR = {currentRocPoint.fpr.toFixed(3)} · TPR = {currentRocPoint.tpr.toFixed(3)}
            </div>
          </div>
          <div className="font-mono text-xs text-(--color-fg-muted) tabular-nums">
            ROC-AUC global = {state.default.roc_auc.toFixed(3)}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sweep} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="roc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="fpr"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                label={{ value: "FPR (taux de FP non filtrés)", fill: CHART_COLORS.muted, fontSize: 10, dy: 12 }}
                {...axisStyle}
              />
              <YAxis
                type="number"
                dataKey="tpr"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                label={{ value: "TPR (rappel)", fill: CHART_COLORS.muted, fontSize: 10, angle: -90, dx: -10 }}
                {...axisStyle}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(3) : String(v))}
              />
              <Area
                type="monotone"
                dataKey="tpr"
                stroke={CHART_COLORS.accent}
                fill="url(#roc-fill)"
                strokeWidth={2}
              />
              <ReferenceLine
                segment={[
                  { x: 0, y: 0 },
                  { x: 1, y: 1 },
                ]}
                stroke={CHART_COLORS.border}
                strokeDasharray="3 3"
              />
              <ReferenceDot
                x={currentRocPoint.fpr}
                y={currentRocPoint.tpr}
                r={6}
                fill={CHART_COLORS.warn}
                stroke={CHART_COLORS.fg}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Slider style override */}
      <style>{`
        .slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 10px;
          background: linear-gradient(
            to right,
            color-mix(in oklch, var(--color-accent) 70%, transparent) 0%,
            color-mix(in oklch, var(--color-accent) 70%, transparent) ${threshold * 100}%,
            var(--color-bg-elevated) ${threshold * 100}%,
            var(--color-bg-elevated) 100%
          );
          border-radius: 999px;
          outline: none;
          cursor: ew-resize;
          border: 1px solid var(--color-border);
        }
        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--color-fg);
          border: 2px solid var(--color-bg);
          box-shadow: 0 0 0 1px var(--color-border-strong), 0 8px 24px -8px rgba(0,0,0,0.5);
          cursor: ew-resize;
          transition: transform 0.15s ease;
        }
        .slider::-webkit-slider-thumb:hover { transform: scale(1.1); }
        .slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--color-fg);
          border: 2px solid var(--color-bg);
          cursor: ew-resize;
        }
      `}</style>
    </div>
  );
}

function Preset({
  label,
  v,
  cur,
  onSet,
}: {
  label: string;
  v: number;
  cur: number;
  onSet: (v: number) => void;
}) {
  const active = Math.abs(cur - v) < 0.005;
  return (
    <button
      onClick={() => onSet(v)}
      className={`px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest border transition-colors ${
        active
          ? "bg-(--color-fg) text-(--color-bg) border-(--color-fg)"
          : "text-(--color-fg-muted) border-(--color-border) hover:text-(--color-fg)"
      }`}
    >
      {label}
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-(--color-fg-muted)">
      <span className="flex items-center gap-2">
        <span className="w-3 h-0.5 bg-(--color-accent)" /> Précision
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-0.5 bg-(--color-info)" /> Rappel
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-0.5 bg-(--color-warn)" /> F1
      </span>
      <span className="flex items-center gap-2">
        <span className="w-3 h-0.5 bg-(--color-fg) [mask-image:repeating-linear-gradient(90deg,black_0,black_4px,transparent_4px,transparent_8px)]" />
        Seuil courant
      </span>
    </div>
  );
}
