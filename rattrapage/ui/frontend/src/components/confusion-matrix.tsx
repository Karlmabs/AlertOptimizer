"use client";

import { motion } from "framer-motion";
import type { Easing } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE: Easing = [0.16, 1, 0.3, 1] as unknown as Easing;

type Props = {
  tp: number;
  fn: number;
  fp_kept: number;
  tn: number;
};

/**
 * Convention spécifique au pipeline (filtrage de FP) :
 *   y_true = 0 → vraie vulnérabilité  (à garder)
 *   y_true = 1 → faux positif         (à filtrer)
 * Donc :
 *   TP = (real TP) AND (kept)      → vraie vuln correctement préservée
 *   FN = (real TP) AND (filtered)  → vraie vuln filtrée par erreur (dangereux)
 *   FP_kept = (real FP) AND (kept) → FP non filtré (coût opérationnel)
 *   TN = (real FP) AND (filtered)  → FP correctement filtré
 */
export function ConfusionMatrix({ tp, fn, fp_kept, tn }: Props) {
  const total = tp + fn + fp_kept + tn;
  const cells = [
    {
      r: 0,
      c: 0,
      label: "TP",
      sub: "Vraie vuln préservée",
      value: tp,
      tone: "accent",
    },
    {
      r: 0,
      c: 1,
      label: "FN",
      sub: "Vraie vuln filtrée — dangereux",
      value: fn,
      tone: "danger",
    },
    {
      r: 1,
      c: 0,
      label: "FP gardé",
      sub: "Coût opérationnel",
      value: fp_kept,
      tone: "warn",
    },
    {
      r: 1,
      c: 1,
      label: "TN",
      sub: "FP correctement filtré",
      value: tn,
      tone: "accent",
    },
  ] as const;
  return (
    <div className="glass border-gradient rounded-(--radius) p-6 md:p-8">
      <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        Matrice de confusion · {total.toLocaleString("fr-FR")} alertes de test
      </div>

      <div className="mt-6 grid grid-cols-[auto_1fr_1fr] gap-2">
        <div />
        <ColLabel>Prédit : à garder</ColLabel>
        <ColLabel>Prédit : à filtrer</ColLabel>

        <RowLabel>Vraie vulnérabilité</RowLabel>
        <Cell {...cells[0]} total={total} index={0} />
        <Cell {...cells[1]} total={total} index={1} />

        <RowLabel>Faux positif réel</RowLabel>
        <Cell {...cells[2]} total={total} index={2} />
        <Cell {...cells[3]} total={total} index={3} />
      </div>
    </div>
  );
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) px-3 py-2 text-center">
      {children}
    </div>
  );
}
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) px-3 py-5 flex items-center max-w-[140px]">
      {children}
    </div>
  );
}

function Cell({
  label,
  sub,
  value,
  tone,
  total,
  index,
}: {
  label: string;
  sub: string;
  value: number;
  tone: "accent" | "danger" | "warn";
  total: number;
  index: number;
}) {
  const pct = (value / total) * 100;
  const toneBg = {
    accent: "bg-(--color-accent)/10 border-(--color-accent)/30",
    danger: "bg-(--color-danger)/10 border-(--color-danger)/30",
    warn: "bg-(--color-warn)/10 border-(--color-warn)/30",
  }[tone];
  const toneFg = {
    accent: "text-(--color-accent)",
    danger: "text-(--color-danger)",
    warn: "text-(--color-warn)",
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.3 + index * 0.1 }}
      className={cn(
        "relative rounded-lg border p-4 md:p-5 overflow-hidden",
        toneBg
      )}
    >
      <div className={cn("text-[10px] font-mono uppercase tracking-widest", toneFg)}>
        {label}
      </div>
      <div className="mt-2 text-3xl md:text-4xl font-semibold tabular-nums">
        {value.toLocaleString("fr-FR")}
      </div>
      <div className="mt-1 text-[11px] text-(--color-fg-muted)">
        {pct.toFixed(1)} %
      </div>
      <div className="mt-2 text-[10px] text-(--color-fg-subtle) leading-snug">
        {sub}
      </div>
    </motion.div>
  );
}
