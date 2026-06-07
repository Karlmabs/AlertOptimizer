"use client";

import { motion } from "framer-motion";
import type { Easing } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { AnimatedCounter } from "./animated-counter";
import { cn } from "@/lib/utils";

const EASE: Easing = [0.16, 1, 0.3, 1] as unknown as Easing;

type Props = {
  label: string;
  /** The current (real) value. */
  value: number;
  /** Number of decimals to show. */
  decimals?: number;
  /** Suffix appended (e.g. " %"). */
  suffix?: string;
  /** The synthetic comparison value. */
  synth: number;
  /** Higher is better (default) — used to color the delta. */
  higherBetter?: boolean;
  /** Optional description below the comparison. */
  caption?: string;
  /** Delay for stagger. */
  index?: number;
  /** Visual accent (subtle glow). */
  accent?: boolean;
};

export function MetricCard({
  label,
  value,
  decimals = 3,
  suffix = "",
  synth,
  higherBetter = true,
  caption,
  index = 0,
  accent,
}: Props) {
  const diff = value - synth;
  const sign = diff > 0 ? "+" : "";
  const good = higherBetter ? diff > 0.0005 : diff < -0.0005;
  const bad = higherBetter ? diff < -0.0005 : diff > 0.0005;
  const Icon = good ? TrendingUp : bad ? TrendingDown : Minus;
  const cls = good
    ? "text-(--color-accent)"
    : bad
      ? "text-(--color-danger)"
      : "text-(--color-fg-muted)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 + index * 0.07 }}
      className={cn(
        "relative glass border-gradient rounded-(--radius) p-5 md:p-6 overflow-hidden",
        accent && "glow-accent"
      )}
    >
      {accent && (
        <div className="absolute -top-px -right-px w-20 h-20 bg-(--color-accent)/20 blur-2xl pointer-events-none" />
      )}
      <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        {label}
      </div>
      <div className="mt-2 text-4xl md:text-5xl font-semibold tracking-tighter tabular-nums leading-none num-gradient">
        <AnimatedCounter
          value={decimals === 0 ? value : value}
          decimals={decimals}
          suffix={suffix}
        />
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <Icon className={cn("w-3.5 h-3.5", cls)} />
        <span className={cn("font-mono tabular-nums", cls)}>
          {sign}
          {decimals === 0
            ? Math.round(diff)
            : diff.toFixed(decimals)}
          {suffix}
        </span>
        <span className="text-(--color-fg-subtle)">
          vs {decimals === 0 ? Math.round(synth) : synth.toFixed(decimals)}
          {suffix} (synthétique)
        </span>
      </div>

      {caption && (
        <div className="mt-3 text-[11px] text-(--color-fg-subtle) leading-relaxed">
          {caption}
        </div>
      )}
    </motion.div>
  );
}
