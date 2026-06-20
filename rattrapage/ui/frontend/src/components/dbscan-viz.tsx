"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";

/**
 * 3-phase DBSCAN explainer on a fixed 2D point cloud:
 *   0 — raw points (grey)
 *   1 — ε-neighbourhood radius appears
 *   2 — dense groups become clusters; sparse points flagged as noise (✕)
 * Auto-cycles; a replay button restarts the sequence.
 */
const CLUSTER_COLORS = ["var(--color-accent)", "var(--color-info)", "var(--color-warn)"];
const NOISE = "var(--color-fg-subtle)";

// Deterministic point cloud — cluster id (-1 = noise)
const PTS: { x: number; y: number; c: number }[] = [
  // cluster 0 (top-left)
  { x: 58, y: 50, c: 0 }, { x: 72, y: 42, c: 0 }, { x: 80, y: 58, c: 0 },
  { x: 64, y: 66, c: 0 }, { x: 90, y: 48, c: 0 }, { x: 50, y: 60, c: 0 },
  // cluster 1 (right)
  { x: 232, y: 56, c: 1 }, { x: 246, y: 66, c: 1 }, { x: 224, y: 70, c: 1 },
  { x: 240, y: 44, c: 1 }, { x: 256, y: 58, c: 1 }, { x: 234, y: 84, c: 1 },
  // cluster 2 (bottom-center)
  { x: 142, y: 150, c: 2 }, { x: 156, y: 142, c: 2 }, { x: 150, y: 162, c: 2 },
  { x: 134, y: 158, c: 2 }, { x: 166, y: 154, c: 2 },
  // noise
  { x: 40, y: 160, c: -1 }, { x: 296, y: 150, c: -1 }, { x: 168, y: 26, c: -1 },
];

export function DbscanViz() {
  const [phase, setPhase] = useState(0);
  const [key, setKey] = useState(0); // bump to replay

  useEffect(() => {
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 900);
    const t2 = setTimeout(() => setPhase(2), 2100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [key]);

  // gentle auto-loop
  useEffect(() => {
    const id = setInterval(() => setKey((k) => k + 1), 6000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass border-gradient rounded-(--radius) p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
          DBSCAN — regroupement par densité
        </div>
        <button
          onClick={() => setKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-[10px] text-(--color-fg-subtle) hover:text-(--color-fg) transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Rejouer
        </button>
      </div>

      <svg viewBox="0 0 320 200" className="w-full h-auto">
        {/* ε radius (phase >= 1), drawn under points */}
        {PTS.map((p, i) => (
          <motion.circle
            key={`r${i}`}
            cx={p.x}
            cy={p.y}
            r={18}
            fill="none"
            stroke={p.c >= 0 ? CLUSTER_COLORS[p.c] : NOISE}
            strokeWidth={0.6}
            strokeDasharray="2 2"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? (phase >= 2 && p.c < 0 ? 0.12 : 0.28) : 0 }}
            transition={{ duration: 0.5, delay: (i % 6) * 0.03 }}
          />
        ))}

        {/* points */}
        {PTS.map((p, i) => {
          const colored = phase >= 2 && p.c >= 0;
          const noise = phase >= 2 && p.c < 0;
          return (
            <g key={`p${i}`}>
              <motion.circle
                cx={p.x}
                cy={p.y}
                animate={{
                  r: colored ? 5 : 4,
                  fill: colored ? CLUSTER_COLORS[p.c] : noise ? NOISE : "var(--color-fg-muted)",
                  opacity: noise ? 0.5 : 1,
                }}
                transition={{ duration: 0.5 }}
              />
              {noise && (
                <motion.text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill={NOISE}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  ✕
                </motion.text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex items-center gap-4 text-[10px] text-(--color-fg-subtle) flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--color-accent)" }} /> cluster
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full opacity-50" style={{ background: NOISE }} /> bruit (✕)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border border-dashed" style={{ borderColor: "var(--color-fg-subtle)" }} /> rayon ε
        </span>
      </div>

      <p className="mt-3 text-xs text-(--color-fg-muted) leading-relaxed">
        Pas besoin de fixer le nombre de groupes : DBSCAN relie les points assez proches (rayon ε) et
        assez nombreux, forme les clusters tout seul, et isole les points isolés comme du <em>bruit</em>.
        Chaque alerte hérite ensuite du taux de faux positifs de son cluster.
      </p>
    </div>
  );
}
