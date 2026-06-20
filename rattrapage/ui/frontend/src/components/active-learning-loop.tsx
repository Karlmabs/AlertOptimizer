"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, HelpCircle, UserCheck, RefreshCw } from "lucide-react";

/**
 * Active-learning cycle: a highlight travels around 4 stages so the *loop*
 * itself is legible, above the interactive lab that shows the numbers.
 */
const NODES = [
  { icon: Cpu, title: "Modèle entraîné", sub: "prédit sur le pool", pos: "top" },
  { icon: HelpCircle, title: "Alerte la + incertaine", sub: "probabilité ≈ 0,5", pos: "right" },
  { icon: UserCheck, title: "L'expert étiquette", sub: "oracle : vrai / faux positif", pos: "bottom" },
  { icon: RefreshCw, title: "Ajout + ré-entraînement", sub: "le modèle s'améliore", pos: "left" },
] as const;

const POS: Record<string, string> = {
  top: "top-0 left-1/2 -translate-x-1/2",
  right: "right-0 top-1/2 -translate-y-1/2",
  bottom: "bottom-0 left-1/2 -translate-x-1/2",
  left: "left-0 top-1/2 -translate-y-1/2",
};

export function ActiveLearningLoop() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % NODES.length), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass border-gradient rounded-(--radius) p-6">
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-4">
        Apprentissage actif — la boucle
      </div>

      <div className="relative mx-auto w-full max-w-md aspect-[5/4]">
        {/* circular arrow (clockwise) */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <marker id="al-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-accent-dim)" />
            </marker>
          </defs>
          <path
            d="M 50 22 A 28 28 0 0 1 78 50 A 28 28 0 0 1 50 78 A 28 28 0 0 1 22 50 A 28 28 0 0 1 50 22"
            fill="none"
            stroke="var(--color-accent-dim)"
            strokeWidth="0.8"
            strokeDasharray="3 3"
            opacity="0.5"
            markerEnd="url(#al-arrow)"
          />
        </svg>

        {/* center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[11px] font-semibold text-(--color-fg)">Uncertainty</div>
            <div className="text-[11px] font-semibold text-(--color-fg)">sampling</div>
          </div>
        </div>

        {/* nodes */}
        {NODES.map((n, i) => {
          const Icon = n.icon;
          const on = i === active;
          return (
            <motion.div
              key={n.title}
              className={`absolute w-36 ${POS[n.pos]}`}
              animate={{ scale: on ? 1.05 : 1 }}
              transition={{ duration: 0.35 }}
            >
              <motion.div
                animate={{
                  borderColor: on ? "var(--color-accent)" : "var(--color-border)",
                  boxShadow: on ? "0 0 22px -8px var(--color-accent)" : "0 0 0 transparent",
                }}
                className="rounded-(--radius) border bg-(--color-bg-elevated)/70 px-3 py-2 text-center backdrop-blur"
                style={{ borderColor: "var(--color-border)" }}
              >
                <motion.div
                  animate={{ color: on ? "var(--color-accent)" : "var(--color-fg-subtle)" }}
                  className="mx-auto mb-1 w-6 h-6 flex items-center justify-center"
                >
                  <Icon className="w-4 h-4" />
                </motion.div>
                <div className="text-[11px] font-semibold text-(--color-fg) leading-tight">{n.title}</div>
                <div className="text-[9px] text-(--color-fg-subtle) leading-tight mt-0.5">{n.sub}</div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-(--color-fg-muted) leading-relaxed">
        Au lieu d&apos;étiqueter au hasard, on demande à l&apos;expert seulement les alertes dont le modèle
        est le <strong className="text-(--color-fg)">moins sûr</strong> (probabilité proche de 0,5) :
        ce sont les plus instructives. On les ajoute, on ré-entraîne, et on recommence.
      </p>
    </div>
  );
}
