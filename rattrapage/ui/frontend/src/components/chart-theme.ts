/**
 * Recharts theme tokens kept centralized so we can swap palette globally.
 * These echo the CSS custom properties from globals.css.
 */
export const CHART_COLORS = {
  fg: "#e6e7eb",
  muted: "#8c8e98",
  subtle: "#5b5d66",
  border: "#2d2f36",
  accent: "#34d399", // emerald-400
  accentDim: "#0f766e",
  danger: "#f87171", // coral
  dangerDim: "#7f1d1d",
  info: "#22d3ee", // cyan-400
  infoDim: "#0e7490",
  warn: "#fbbf24", // amber-400
  warnDim: "#92400e",
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "rgba(20, 23, 30, 0.92)",
    border: "1px solid #3a3d44",
    borderRadius: "8px",
    backdropFilter: "blur(20px)",
    fontFamily: "var(--font-sans, system-ui)",
    fontSize: "12px",
    padding: "10px 14px",
    boxShadow: "0 12px 32px -10px rgba(0,0,0,0.5)",
  },
  labelStyle: {
    color: "#8c8e98",
    fontSize: "10px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    marginBottom: "4px",
  },
  itemStyle: {
    color: "#e6e7eb",
    padding: 0,
  },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};

export const axisStyle = {
  stroke: CHART_COLORS.border,
  tick: { fill: CHART_COLORS.muted, fontSize: 11, fontFamily: "var(--font-mono, monospace)" },
  axisLine: { stroke: CHART_COLORS.border },
  tickLine: { stroke: CHART_COLORS.border },
};
