"use client";

import { motion } from "framer-motion";
import type { Easing } from "framer-motion";
import { ReactNode } from "react";

const EASE: Easing = [0.16, 1, 0.3, 1] as unknown as Easing;

type Props = {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Right-hand action (e.g. a "Reset" button). */
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, intro, action }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="mb-8 md:mb-10 flex items-start justify-between gap-6 flex-wrap"
    >
      <div className="max-w-3xl">
        {eyebrow && (
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-(--color-fg-subtle) mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl md:text-4xl font-semibold tracking-tight num-gradient">
          {title}
        </h1>
        {intro && (
          <p className="mt-4 text-sm md:text-base text-(--color-fg-muted) leading-relaxed">
            {intro}
          </p>
        )}
      </div>
      {action}
    </motion.header>
  );
}
