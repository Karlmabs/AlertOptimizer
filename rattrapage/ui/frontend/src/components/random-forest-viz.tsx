"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";

/**
 * Random Forest explainer: one alert is shown to N trees, each votes a
 * probability, the forest averages them into one calibrated P(false positive).
 */
const VOTES = [0.91, 0.78, 0.88, 0.95, 0.82];
const AVG = VOTES.reduce((a, b) => a + b, 0) / VOTES.length; // 0.868

function MiniTree({ lit }: { lit: boolean }) {
  const stroke = lit ? "var(--color-accent)" : "var(--color-fg-subtle)";
  return (
    <svg viewBox="0 0 40 34" className="w-9 h-8">
      <motion.g animate={{ stroke, opacity: lit ? 1 : 0.45 }} fill="none" strokeWidth={1.4}>
        <line x1="20" y1="6" x2="10" y2="18" />
        <line x1="20" y1="6" x2="30" y2="18" />
        <line x1="10" y1="18" x2="5" y2="28" />
        <line x1="10" y1="18" x2="15" y2="28" />
        <line x1="30" y1="18" x2="25" y2="28" />
        <line x1="30" y1="18" x2="35" y2="28" />
      </motion.g>
      <motion.g animate={{ fill: stroke }}>
        <circle cx="20" cy="6" r="2.4" />
        <circle cx="10" cy="18" r="2" />
        <circle cx="30" cy="18" r="2" />
        <circle cx="5" cy="28" r="1.8" />
        <circle cx="15" cy="28" r="1.8" />
        <circle cx="25" cy="28" r="1.8" />
        <circle cx="35" cy="28" r="1.8" />
      </motion.g>
    </svg>
  );
}

export function RandomForestViz() {
  const [step, setStep] = useState(-1); // -1 idle, 0..N-1 trees lit, N show avg
  const [key, setKey] = useState(0);

  useEffect(() => {
    setStep(-1);
    const timers = VOTES.map((_, i) => setTimeout(() => setStep(i), 500 + i * 450));
    const last = setTimeout(() => setStep(VOTES.length), 500 + VOTES.length * 450 + 300);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(last);
    };
  }, [key]);

  useEffect(() => {
    const id = setInterval(() => setKey((k) => k + 1), 6000);
    return () => clearInterval(id);
  }, []);

  const showAvg = step >= VOTES.length;

  return (
    <div className="glass border-gradient rounded-(--radius) p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
          Random Forest — les arbres votent
        </div>
        <button
          onClick={() => setKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-[10px] text-(--color-fg-subtle) hover:text-(--color-fg) transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Rejouer
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* input alert */}
        <div className="shrink-0 text-center">
          <div className="w-12 h-12 rounded-lg bg-(--color-info)/10 border border-(--color-info)/30 flex items-center justify-center text-(--color-info) text-[10px] font-mono">
            alerte
          </div>
        </div>

        {/* trees + votes */}
        <div className="flex-1 grid grid-cols-5 gap-1">
          {VOTES.map((v, i) => {
            const lit = step >= i;
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <MiniTree lit={lit} />
                <motion.span
                  className="text-[10px] font-mono tabular-nums"
                  animate={{ opacity: lit ? 1 : 0.25, color: lit ? "var(--color-fg)" : "var(--color-fg-subtle)" }}
                >
                  {v.toFixed(2)}
                </motion.span>
              </div>
            );
          })}
        </div>

        {/* average result */}
        <div className="shrink-0 w-24 text-center">
          <div className="text-[10px] text-(--color-fg-subtle) mb-1">moyenne</div>
          <div className="h-3 w-full rounded-full bg-(--color-bg-elevated) overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "var(--color-accent)" }}
              animate={{ width: showAvg ? `${AVG * 100}%` : "0%" }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>
          <motion.div
            className="mt-1 text-sm font-semibold tabular-nums text-(--color-accent)"
            animate={{ opacity: showAvg ? 1 : 0.2 }}
          >
            {showAvg ? AVG.toFixed(2) : "—"}
          </motion.div>
          <div className="text-[9px] text-(--color-fg-subtle) leading-tight">P(faux positif)</div>
        </div>
      </div>

      <p className="mt-4 text-xs text-(--color-fg-muted) leading-relaxed">
        Chaque arbre est entraîné sur un échantillon différent et donne son propre vote. La forêt
        fait la <strong className="text-(--color-fg)">moyenne</strong> des votes → une probabilité
        plus stable et plus fiable qu&apos;un arbre seul. C&apos;est cette probabilité que le seuil tranche.
      </p>
    </div>
  );
}
