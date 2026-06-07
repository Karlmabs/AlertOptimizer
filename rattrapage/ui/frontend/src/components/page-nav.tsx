"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { NAV, navIndex } from "@/lib/nav";

/** Prev/Next buttons at the bottom of each page — drives the linear narrative for the defense. */
export function PageNav() {
  const pathname = usePathname();
  const i = navIndex(pathname);
  const prev = NAV[i - 1];
  const next = NAV[i + 1];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="mt-20 md:mt-28 grid grid-cols-2 gap-3 max-w-3xl mx-auto"
    >
      {prev ? (
        <Link
          href={prev.href}
          className="group glass border-gradient rounded-(--radius) p-5 hover:bg-(--color-bg-elevated) transition-colors"
        >
          <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle) flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Précédent
          </div>
          <div className="mt-2 text-base font-medium group-hover:translate-x-[-2px] transition-transform">
            {prev.label}
          </div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group glass border-gradient rounded-(--radius) p-5 hover:bg-(--color-bg-elevated) transition-colors text-right"
        >
          <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle) flex items-center gap-1.5 justify-end">
            Suivant <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <div className="mt-2 text-base font-medium group-hover:translate-x-[2px] transition-transform">
            {next.label}
          </div>
        </Link>
      ) : (
        <div />
      )}
    </motion.div>
  );
}
