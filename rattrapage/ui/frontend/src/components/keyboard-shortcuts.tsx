"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { NAV, navIndex } from "@/lib/nav";

/**
 * Global keyboard shortcuts:
 *   →  /  Space  : next page
 *   ←  /  Shift+Space : previous page
 *   P  : toggle presentation mode (hide sidebar, full-screen content)
 *   ?  : toggle the help cheatsheet
 *   ESC: exit presentation mode / close cheatsheet
 *
 * The "presentation" flag is sent to the layout via a CSS custom property on <html>,
 * which the sidebar reads to fade out.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [present, setPresent] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.presentation = present ? "true" : "false";
  }, [present]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Don't intercept when typing in inputs
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      if (e.key === "Escape") {
        if (showHelp) setShowHelp(false);
        else if (present) setPresent(false);
        return;
      }

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }

      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setPresent((v) => !v);
        return;
      }

      const i = navIndex(pathname);
      if (e.key === "ArrowRight" || (e.key === " " && !e.shiftKey)) {
        e.preventDefault();
        if (i < NAV.length - 1) router.push(NAV[i + 1].href);
      } else if (e.key === "ArrowLeft" || (e.key === " " && e.shiftKey)) {
        e.preventDefault();
        if (i > 0) router.push(NAV[i - 1].href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname, present, showHelp]);

  return (
    <>
      <ProgressIndicator pathname={pathname} />
      <HelpButton onClick={() => setShowHelp(true)} present={present} />
      <AnimatePresence>{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}</AnimatePresence>
      {present && <PresentationBadge onExit={() => setPresent(false)} />}
    </>
  );
}

function ProgressIndicator({ pathname }: { pathname: string }) {
  const i = navIndex(pathname);
  const pct = ((i + 1) / NAV.length) * 100;
  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 bg-(--color-border) z-50 pointer-events-none">
      <motion.div
        className="h-full bg-(--color-accent)"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function HelpButton({ onClick, present }: { onClick: () => void; present: boolean }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-5 right-5 z-40 w-10 h-10 rounded-full glass border-gradient flex items-center justify-center text-(--color-fg-muted) hover:text-(--color-fg) transition-colors"
      title="Raccourcis clavier (?)"
    >
      <Keyboard className="w-4 h-4" />
      {present && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-(--color-accent) pulse-glow" />
      )}
    </button>
  );
}

function PresentationBadge({ onExit }: { onExit: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="fixed bottom-5 left-5 z-40 px-3 py-2 rounded-full glass border border-(--color-accent)/40 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-(--color-accent)"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-(--color-accent) pulse-glow" />
      Mode présentation
      <button onClick={onExit} className="ml-1 hover:text-(--color-fg)">
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-(--color-bg)/80 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong border-gradient rounded-(--radius) p-7 md:p-9 max-w-md w-full"
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
              Raccourcis
            </div>
            <h2 className="text-xl font-semibold mt-1">Navigation au clavier</h2>
          </div>
          <button onClick={onClose} className="text-(--color-fg-muted) hover:text-(--color-fg)">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 text-sm">
          {[
            { keys: ["→", "Espace"], label: "Slide suivante" },
            { keys: ["←", "Shift+Espace"], label: "Slide précédente" },
            { keys: ["P"], label: "Mode présentation (masquer la sidebar)" },
            { keys: ["?"], label: "Afficher cette aide" },
            { keys: ["Esc"], label: "Quitter mode / fermer" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-(--color-fg-muted)">{row.label}</span>
              <div className="flex gap-1.5">
                {row.keys.map((k) => (
                  <kbd
                    key={k}
                    className="px-2 py-1 rounded-md bg-(--color-bg-elevated) border border-(--color-border) font-mono text-xs text-(--color-fg)"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
