"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Loader2, Check, X, RefreshCcw, ChevronDown } from "lucide-react";
import { streamSSE, checkBackend } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "idle" | "checking" | "running" | "done" | "error" | "offline";

type Props = {
  endpoint: string;
  label: string;
  /** When true, lock during presentation mode to avoid accidental clicks in front of jury. */
  lockOnPresent?: boolean;
};

export function RunExperimentButton({ endpoint, label, lockOnPresent = true }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Watch presentation flag
  useEffect(() => {
    const update = () => {
      setPresent(document.documentElement.dataset.presentation === "true");
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-presentation"],
    });
    return () => obs.disconnect();
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Cleanup
  useEffect(() => () => cleanupRef.current?.(), []);

  const locked = lockOnPresent && present && status !== "running";

  async function start() {
    setStatus("checking");
    setLines([]);
    setExitCode(null);
    const ok = await checkBackend();
    if (!ok) {
      setStatus("offline");
      return;
    }
    setStatus("running");
    setOpen(true);
    cleanupRef.current = streamSSE(endpoint, {
      onLine: (l) =>
        setLines((prev) => (prev.length > 5000 ? [...prev.slice(-3000), l.text] : [...prev, l.text])),
      onDone: (d) => {
        setExitCode(d.exit_code);
        setStatus(d.exit_code === 0 ? "done" : "error");
      },
      onError: () => setStatus("error"),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={start}
          disabled={locked || status === "running" || status === "checking"}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors",
            locked
              ? "bg-(--color-bg-elevated)/60 text-(--color-fg-subtle) cursor-not-allowed"
              : status === "running"
                ? "bg-(--color-bg-elevated) text-(--color-fg-muted)"
                : "bg-(--color-fg) text-(--color-bg) hover:bg-(--color-accent)"
          )}
          title={locked ? "Désactivé en mode présentation" : undefined}
        >
          {status === "running" || status === "checking" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === "done" ? (
            <Check className="w-4 h-4 text-(--color-accent)" />
          ) : status === "error" ? (
            <X className="w-4 h-4 text-(--color-danger)" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {status === "running"
            ? "En cours…"
            : status === "checking"
              ? "Connexion…"
              : status === "done"
                ? "Terminé · Relancer"
                : status === "error"
                  ? "Erreur · Réessayer"
                  : label}
        </button>

        {status === "offline" && (
          <div className="text-xs text-(--color-danger) flex items-center gap-2">
            <X className="w-3 h-3" />
            Backend hors ligne — lance{" "}
            <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-(--color-bg-elevated)">
              ./rattrapage/ui/backend/start.sh
            </code>
          </div>
        )}

        {lines.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-(--color-fg-muted) hover:text-(--color-fg) flex items-center gap-1.5"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            {lines.length} lignes
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="glass border-gradient rounded-(--radius) p-4 font-mono text-[11px] text-(--color-fg-muted) leading-relaxed max-h-72 overflow-y-auto whitespace-pre"
            >
              {lines.map((line, i) => (
                <div key={i}>{line || " "}</div>
              ))}
              {status === "running" && (
                <span className="inline-flex items-center gap-1 text-(--color-fg-subtle)">
                  <RefreshCcw className="w-3 h-3 animate-spin" /> en cours…
                </span>
              )}
              {exitCode !== null && (
                <div className="mt-3 pt-3 border-t border-(--color-border) text-(--color-fg-muted)">
                  Exit code: <span className="text-(--color-fg)">{exitCode}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
