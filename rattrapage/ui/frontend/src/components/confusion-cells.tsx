"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  tp: number;
  fn: number;
  fp_kept: number;
  tn: number;
  /** When the values change due to slider movement, animate the cells. */
  animateKey?: string | number;
};

const FR = new Intl.NumberFormat("fr-FR");

/**
 * Compact 2×2 confusion matrix for the threshold tuner.
 * Convention: y_true=0 → real vuln (to keep) ; y_true=1 → FP (to filter).
 *   TP      = real vuln correctly kept (good)
 *   FN      = real vuln wrongly filtered (DANGER — sécurité)
 *   FP_kept = FP incorrectly kept (operational cost)
 *   TN      = FP correctly filtered (good)
 */
export function ConfusionCells({ tp, fn, fp_kept, tn, animateKey }: Props) {
  const total = tp + fn + fp_kept + tn;
  const cells = [
    { label: "TP", value: tp, tone: "accent", note: "Vraie vuln préservée" },
    { label: "FN", value: fn, tone: "danger", note: "Vraie vuln filtrée — danger" },
    { label: "FP kept", value: fp_kept, tone: "warn", note: "FP non filtré — bruit" },
    { label: "TN", value: tn, tone: "accent", note: "FP correctement filtré" },
  ] as const;

  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 select-none">
      <div />
      <Header>Gardée</Header>
      <Header>Filtrée</Header>

      <RowLabel>Vraie vuln</RowLabel>
      <Cell {...cells[0]} total={total} animateKey={animateKey} />
      <Cell {...cells[1]} total={total} animateKey={animateKey} />

      <RowLabel>FP réel</RowLabel>
      <Cell {...cells[2]} total={total} animateKey={animateKey} />
      <Cell {...cells[3]} total={total} animateKey={animateKey} />
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-mono uppercase tracking-widest text-(--color-fg-subtle) text-center py-1.5">
      {children}
    </div>
  );
}
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-mono uppercase tracking-widest text-(--color-fg-subtle) py-3 pr-2 flex items-center justify-end max-w-[80px]">
      {children}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
  note,
  total,
  animateKey,
}: {
  label: string;
  value: number;
  tone: "accent" | "danger" | "warn";
  note: string;
  total: number;
  animateKey?: string | number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const colors = {
    accent: { bg: "bg-(--color-accent)/10", border: "border-(--color-accent)/30", fg: "text-(--color-accent)" },
    danger: { bg: "bg-(--color-danger)/10", border: "border-(--color-danger)/30", fg: "text-(--color-danger)" },
    warn: { bg: "bg-(--color-warn)/10", border: "border-(--color-warn)/30", fg: "text-(--color-warn)" },
  }[tone];
  return (
    <motion.div
      key={`${animateKey}-${label}`}
      initial={{ opacity: 0.7, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn("rounded-lg border p-3 md:p-4", colors.bg, colors.border)}
      title={note}
    >
      <div className={cn("text-[10px] font-mono uppercase tracking-widest", colors.fg)}>
        {label}
      </div>
      <div className="mt-1 text-xl md:text-2xl font-semibold tabular-nums">
        {FR.format(value)}
      </div>
      <div className="mt-0.5 text-[10px] text-(--color-fg-muted) font-mono">
        {pct.toFixed(1)} %
      </div>
    </motion.div>
  );
}
