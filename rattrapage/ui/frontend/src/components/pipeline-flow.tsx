"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, Sliders, Beaker, TrendingUp, GaugeCircle } from "lucide-react";

/**
 * Animated end-to-end pipeline schematic.
 * A highlight travels stage-by-stage so the viewer sees *what flows where*,
 * not just the final numbers. Auto-cycles; lightweight (one interval).
 */
const STAGES = [
  { icon: Database, label: "Alertes SARIF", sub: "entrée brute (JSON)", tone: "info" },
  { icon: Sliders, label: "8 features", sub: "normalisées par alerte", tone: "info" },
  { icon: Beaker, label: "DBSCAN", sub: "clusters par densité → +2 features", tone: "warn" },
  { icon: TrendingUp, label: "Random Forest", sub: "P(faux positif) par alerte", tone: "accent" },
  { icon: GaugeCircle, label: "Seuil", sub: "garder ✓ / filtrer ✕", tone: "accent" },
] as const;

const TONE: Record<string, string> = {
  info: "var(--color-info)",
  warn: "var(--color-warn)",
  accent: "var(--color-accent)",
};

export function PipelineFlow() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass border-gradient rounded-(--radius) p-6">
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-5">
        Comment ça marche — le pipeline de bout en bout
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-1">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const on = i === active;
          const color = TONE[s.tone];
          return (
            <div key={s.label} className="flex flex-col md:flex-row items-center gap-2 md:gap-1 flex-1">
              <motion.div
                animate={{
                  scale: on ? 1.04 : 1,
                  boxShadow: on ? `0 0 26px -6px ${color}` : "0 0 0px transparent",
                  borderColor: on ? color : "var(--color-border)",
                }}
                transition={{ duration: 0.4 }}
                className="w-full md:w-auto flex-1 rounded-(--radius) border bg-(--color-bg-elevated)/40 px-3 py-3 text-center"
                style={{ borderColor: "var(--color-border)" }}
              >
                <motion.div
                  animate={{ color: on ? color : "var(--color-fg-subtle)" }}
                  className="mx-auto mb-1.5 w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: on ? `color-mix(in oklch, ${color} 14%, transparent)` : "transparent" }}
                >
                  <Icon className="w-4 h-4" />
                </motion.div>
                <div className="text-xs font-semibold text-(--color-fg)">{s.label}</div>
                <div className="text-[10px] text-(--color-fg-subtle) leading-tight mt-0.5">{s.sub}</div>
              </motion.div>

              {i < STAGES.length - 1 && (
                <div className="relative h-4 md:h-px w-px md:w-6 bg-(--color-border) overflow-visible flex items-center justify-center">
                  <motion.span
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{ background: color }}
                    animate={{ opacity: i === active ? [0, 1, 0] : 0 }}
                    transition={{ duration: 1.2, repeat: i === active ? Infinity : 0 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-(--color-fg-muted) leading-relaxed">
        Le même fichier SARIF traverse 5 étapes : on en extrait des caractéristiques, DBSCAN les
        regroupe par densité (et fabrique 2 features de cluster), la forêt aléatoire estime une
        probabilité de faux positif, puis un seuil décide quoi garder ou filtrer.
      </p>
    </div>
  );
}
