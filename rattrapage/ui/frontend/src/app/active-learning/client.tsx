"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Loader2, Trash2, ArrowRight, AlertTriangle } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { activeLearningStep, type WorkbenchState, type ALStepResponse } from "@/lib/api";
import { MetricTile } from "@/components/metric-tile";
import { CHART_COLORS, tooltipStyle, axisStyle } from "@/components/chart-theme";
import { cn } from "@/lib/utils";

type PoolItem = {
  id: number;
  rule_id: string;
  rule_category: string;
  source: string;
  file_path: string;
  start_line: number;
  y_true: 0 | 1;
  y_prob: number;
  uncertainty: number;
};

type Cycle = {
  cycle: number;
  n_train: number;
  f1: number;
  precision: number;
  recall: number;
  reduction: number;
};

export function ALClient({
  initialPool,
  defaults,
}: {
  initialPool: PoolItem[];
  defaults: WorkbenchState["default"];
}) {
  const [pool] = useState<PoolItem[]>(initialPool.slice(0, 200)); // first 200 most uncertain
  const [labels, setLabels] = useState<Record<number, 0 | 1>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([
    {
      cycle: 0,
      n_train: 6622,
      f1: defaults.metrics.f1,
      precision: defaults.metrics.precision,
      recall: defaults.metrics.recall,
      reduction: defaults.metrics.reduction,
    },
  ]);
  const [last, setLast] = useState<ALStepResponse | null>(null);

  function toggle(id: number, label: 0 | 1) {
    setLabels((prev) => {
      const cur = prev[id];
      if (cur === label) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: label };
    });
  }

  async function submit() {
    if (Object.keys(labels).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await activeLearningStep(labels);
      setLast(r);
      setCycles((prev) => [
        ...prev,
        {
          cycle: prev.length,
          n_train: r.n_train_after,
          f1: r.metrics.f1,
          precision: r.metrics.precision,
          recall: r.metrics.recall,
          reduction: r.metrics.reduction,
        },
      ]);
      setLabels({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "AL step failed");
    } finally {
      setBusy(false);
    }
  }

  const labeledCount = Object.keys(labels).length;
  const m = last?.metrics ?? defaults.metrics;

  return (
    <div className="space-y-6">
      {/* Current state */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricTile label="Cycles" value={cycles.length - 1} decimals={0} />
        <MetricTile label="F1" value={m.f1} accent baseline={defaults.metrics.f1} />
        <MetricTile label="Précision" value={m.precision} baseline={defaults.metrics.precision} />
        <MetricTile label="Rappel" value={m.recall} baseline={defaults.metrics.recall} />
        <MetricTile label="Réduction" value={m.reduction * 100} suffix=" %" decimals={1} baseline={defaults.metrics.reduction * 100} />
      </div>

      {/* Progress chart */}
      {cycles.length > 1 && (
        <div className="glass border-gradient rounded-(--radius) p-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-2">
            F1 par cycle d&apos;active learning
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cycles} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" />
                <XAxis dataKey="cycle" {...axisStyle} />
                <YAxis domain={[0.85, 0.92]} tickFormatter={(v) => v.toFixed(3)} {...axisStyle} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(4) : String(v))}
                  labelFormatter={(l) => `Cycle ${l}`}
                />
                <ReferenceLine y={defaults.metrics.f1} stroke={CHART_COLORS.muted} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="f1" stroke={CHART_COLORS.accent} strokeWidth={2.5} dot={{ r: 5 }} animationDuration={500} />
                <Line type="monotone" dataKey="recall" stroke={CHART_COLORS.info} strokeWidth={2} dot={{ r: 4 }} animationDuration={500} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-(--color-fg-muted)">
            <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-(--color-accent)" /> F1</span>
            <span className="flex items-center gap-2"><span className="w-3 h-0.5 bg-(--color-info)" /> Rappel</span>
            <span className="text-(--color-fg-subtle)">— pointillé = F1 initial</span>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="glass border-gradient rounded-(--radius) p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold text-(--color-fg)">{labeledCount}</span>{" "}
          <span className="text-(--color-fg-muted)">alerte(s) labellisée(s) prêtes à être envoyées</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLabels({})}
            disabled={labeledCount === 0 || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-(--color-fg-muted) border border-(--color-border) hover:text-(--color-fg) disabled:opacity-30"
          >
            <Trash2 className="w-3 h-3" /> Réinitialiser
          </button>
          <button
            onClick={submit}
            disabled={labeledCount === 0 || busy}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-(--color-fg) text-(--color-bg) font-medium text-sm transition-colors hover:bg-(--color-accent) disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {busy ? "Ré-entraînement…" : "Soumettre le cycle"}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass border border-(--color-danger)/40 rounded-(--radius) p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-(--color-danger) shrink-0 mt-0.5" />
          <span className="text-(--color-fg-muted)">{error}</span>
        </div>
      )}

      {/* Pool list */}
      <div className="glass border-gradient rounded-(--radius) overflow-hidden">
        <div className="px-5 py-3 border-b border-(--color-border) text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
          Pool des alertes les plus incertaines · 200 affichées (sur 26 491 disponibles)
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {pool.map((p) => {
            const label = labels[p.id];
            return (
              <motion.div
                key={p.id}
                initial={false}
                className={cn(
                  "grid grid-cols-[1fr_auto] gap-3 px-4 py-3 border-b border-(--color-border) hover:bg-(--color-bg-elevated)/30 transition-colors",
                  label !== undefined && "bg-(--color-bg-elevated)/40"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <code className="font-mono text-[11px] text-(--color-fg) truncate max-w-[420px]">
                      {p.rule_id}
                    </code>
                    <span className="font-mono text-[10px] text-(--color-fg-muted) tabular-nums">
                      p={p.y_prob.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-(--color-fg-subtle) truncate">
                    {p.file_path.split("/").slice(-2).join("/")} : {p.start_line}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggle(p.id, 0)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest border transition-colors",
                      label === 0
                        ? "bg-(--color-accent)/20 text-(--color-accent) border-(--color-accent)/40"
                        : "border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg)"
                    )}
                    title="Vraie vulnérabilité"
                  >
                    <Check className="w-3 h-3 inline mr-1" /> TP
                  </button>
                  <button
                    onClick={() => toggle(p.id, 1)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest border transition-colors",
                      label === 1
                        ? "bg-(--color-danger)/20 text-(--color-danger) border-(--color-danger)/40"
                        : "border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg)"
                    )}
                    title="Faux positif"
                  >
                    <X className="w-3 h-3 inline mr-1" /> FP
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {last && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass border-gradient rounded-(--radius) p-5 text-sm text-(--color-fg-muted)"
          >
            Cycle terminé : <span className="text-(--color-fg)">{last.n_new_labels}</span> labels intégrés,
            ensemble d&apos;entraînement à <span className="text-(--color-fg)">{last.n_train_after}</span> exemples,
            pool restant <span className="text-(--color-fg)">{last.n_pool_after}</span>.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
