"use client";

import { motion } from "framer-motion";
import type { Easing } from "framer-motion";
import { ReactNode } from "react";

const EASE: Easing = [0.16, 1, 0.3, 1] as unknown as Easing;

type Props = {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
};

export function PageShell({ eyebrow, title, intro, children }: Props) {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-10 md:py-14 max-w-7xl mx-auto w-full">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="mb-10 md:mb-14"
      >
        {eyebrow && (
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-(--color-fg-subtle) mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight num-gradient">
          {title}
        </h1>
        {intro && (
          <p className="mt-5 md:mt-7 text-base md:text-lg text-(--color-fg-muted) max-w-3xl leading-relaxed">
            {intro}
          </p>
        )}
      </motion.header>
      {children}
    </div>
  );
}
