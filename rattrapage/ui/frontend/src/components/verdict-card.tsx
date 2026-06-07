"use client";

import { motion } from "framer-motion";
import type { Easing } from "framer-motion";
import { Check, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE: Easing = [0.16, 1, 0.3, 1] as unknown as Easing;

export type VerdictStatus = "validated" | "not_validated" | "partial";

type Props = {
  hypothesis: string;
  description: string;
  criterion: string;
  synthetic: { value: string; status: VerdictStatus };
  real: { value: string; status: VerdictStatus };
  delta?: string;
  index: number;
};

const STATUS_LABEL: Record<VerdictStatus, string> = {
  validated: "VALIDÉE",
  not_validated: "NON VALIDÉE",
  partial: "PARTIELLE",
};

const STATUS_BG: Record<VerdictStatus, string> = {
  validated: "bg-(--color-accent)/15 text-(--color-accent) border-(--color-accent)/40",
  not_validated: "bg-(--color-danger)/10 text-(--color-danger) border-(--color-danger)/30",
  partial: "bg-(--color-warn)/15 text-(--color-warn) border-(--color-warn)/40",
};

const STATUS_ICON: Record<VerdictStatus, React.ComponentType<{ className?: string }>> = {
  validated: Check,
  not_validated: X,
  partial: Minus,
};

export function VerdictCard({
  hypothesis,
  description,
  criterion,
  synthetic,
  real,
  delta,
  index,
}: Props) {
  const RealIcon = STATUS_ICON[real.status];
  const SynthIcon = STATUS_ICON[synthetic.status];

  const improved =
    real.status === "validated" && synthetic.status !== "validated";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE, delay: 0.15 + index * 0.12 }}
      className={cn(
        "relative glass border-gradient rounded-(--radius) p-7 md:p-8 overflow-hidden",
        improved && "glow-accent"
      )}
    >
      {improved && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-(--color-accent)/15 text-[10px] font-mono uppercase tracking-widest text-(--color-accent) flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Amélioration
        </div>
      )}

      <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        Hypothèse
      </div>
      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
        <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">{hypothesis}</h3>
        <span className="text-sm text-(--color-fg-muted)">{description}</span>
      </div>

      <div className="mt-2 text-xs font-mono text-(--color-fg-subtle)">
        Critère : {criterion}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
            Mémoire (synthétique)
          </div>
          <div className="text-2xl md:text-3xl font-semibold tabular-nums">
            {synthetic.value}
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border",
              STATUS_BG[synthetic.status]
            )}
          >
            <SynthIcon className="w-3 h-3" />
            {STATUS_LABEL[synthetic.status]}
          </div>
        </div>

        <div className="space-y-2 relative pl-5 md:pl-7">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-(--color-border-strong)" />
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
            Addendum (réel)
          </div>
          <div className="text-2xl md:text-3xl font-semibold tabular-nums">
            {real.value}
          </div>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 18,
              delay: 0.9 + index * 0.12,
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border",
              STATUS_BG[real.status]
            )}
          >
            <RealIcon className="w-3 h-3" />
            {STATUS_LABEL[real.status]}
          </motion.div>
        </div>
      </div>

      {delta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 + index * 0.12, duration: 0.6 }}
          className="mt-6 pt-5 border-t border-(--color-border) text-xs text-(--color-fg-muted)"
        >
          <span className="text-(--color-fg-subtle) font-mono">DELTA</span>
          <span className="ml-2">{delta}</span>
        </motion.div>
      )}
    </motion.div>
  );
}
