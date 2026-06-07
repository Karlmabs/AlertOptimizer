"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";

type Props = {
  value: number;
  /** Number of decimals shown. */
  decimals?: number;
  /** Optional prefix (e.g. "F1=") and suffix (e.g. "%"). */
  prefix?: string;
  suffix?: string;
  /** Animation duration in seconds. */
  duration?: number;
  /** Use French digit grouping (66 227). */
  group?: boolean;
  className?: string;
  /** If true, runs only when in view (default). If false, runs on mount. */
  whenInView?: boolean;
};

const FR = new Intl.NumberFormat("fr-FR", { useGrouping: true });

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.6,
  group = false,
  className,
  whenInView = true,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => {
    if (decimals === 0) {
      const i = Math.round(v);
      return `${prefix}${group ? FR.format(i) : i}${suffix}`;
    }
    return `${prefix}${v.toFixed(decimals)}${suffix}`;
  });

  useEffect(() => {
    if (whenInView && !inView) return;
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1], // expo out
    });
    return () => controls.stop();
  }, [inView, value, duration, mv, whenInView]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
