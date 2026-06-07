"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  /** Optional baseline value to show a delta against. */
  baseline?: number;
  /** Higher is better (default true) — colors the delta. */
  higherBetter?: boolean;
  accent?: boolean;
  className?: string;
};

const FR = new Intl.NumberFormat("fr-FR");

export function MetricTile({
  label,
  value,
  decimals = 3,
  suffix = "",
  baseline,
  higherBetter = true,
  accent,
  className,
}: Props) {
  const formatted =
    decimals === 0
      ? FR.format(Math.round(value))
      : value.toFixed(decimals);

  const delta = baseline === undefined ? null : value - baseline;
  const deltaSign = delta != null ? (delta > 0 ? "+" : "") : "";
  const good = delta != null && (higherBetter ? delta > 1e-6 : delta < -1e-6);
  const bad = delta != null && (higherBetter ? delta < -1e-6 : delta > 1e-6);

  return (
    <div
      className={cn(
        "relative glass border-gradient rounded-(--radius) px-5 py-4 overflow-hidden",
        accent && "glow-accent",
        className
      )}
    >
      {accent && (
        <div className="absolute -top-px -right-px w-16 h-16 bg-(--color-accent)/20 blur-2xl pointer-events-none" />
      )}
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        {label}
      </div>
      <motion.div
        key={`${value}`}
        initial={{ opacity: 0.5, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mt-1 text-3xl md:text-4xl font-semibold tabular-nums tracking-tight num-gradient"
      >
        {formatted}
        {suffix}
      </motion.div>
      {delta != null && (
        <div
          className={cn(
            "mt-1.5 text-[11px] font-mono tabular-nums",
            good
              ? "text-(--color-accent)"
              : bad
                ? "text-(--color-danger)"
                : "text-(--color-fg-subtle)"
          )}
        >
          {deltaSign}
          {decimals === 0
            ? FR.format(Math.round(delta))
            : delta.toFixed(decimals)}
          {suffix}
        </div>
      )}
    </div>
  );
}
