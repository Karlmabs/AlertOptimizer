"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  description?: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export function ParamSlider({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
}: Props) {
  const fmt = format ?? ((v: number) => v.toString());
  const pct = ((value - min) / (max - min)) * 100;
  const isDefault = Math.abs(value - defaultValue) < step / 2;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
            {label}
          </div>
          <motion.div
            key={value}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            className="text-2xl font-semibold tabular-nums num-gradient mt-0.5"
          >
            {fmt(value)}
          </motion.div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-(--color-fg-subtle)">
          {!isDefault && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-(--color-fg-muted) hover:text-(--color-fg)"
              title={`Reset to ${fmt(defaultValue)}`}
              disabled={disabled}
            >
              reset
            </button>
          )}
          <span>v6: {fmt(defaultValue)}</span>
        </div>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className={cn(
            "w-full param-slider",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{
            background: `linear-gradient(to right,
              color-mix(in oklch, var(--color-accent) 70%, transparent) 0%,
              color-mix(in oklch, var(--color-accent) 70%, transparent) ${pct}%,
              var(--color-bg-elevated) ${pct}%,
              var(--color-bg-elevated) 100%)`,
          }}
        />
      </div>
      {description && (
        <div className="text-[11px] text-(--color-fg-subtle) leading-snug">
          {description}
        </div>
      )}
      <style>{`
        .param-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          border-radius: 999px;
          outline: none;
          cursor: ew-resize;
          border: 1px solid var(--color-border);
        }
        .param-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-fg);
          border: 2px solid var(--color-bg);
          box-shadow: 0 0 0 1px var(--color-border-strong);
          cursor: ew-resize;
        }
        .param-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-fg);
          border: 2px solid var(--color-bg);
          cursor: ew-resize;
        }
      `}</style>
    </div>
  );
}
