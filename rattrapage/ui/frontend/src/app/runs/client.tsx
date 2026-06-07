"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, Check, X, ChevronDown } from "lucide-react";
import { streamSSE, checkBackend } from "@/lib/api";
import { cn } from "@/lib/utils";

const RUNS = [
  {
    endpoint: "/api/run/experiment",
    title: "Expérimentation complète",
    desc: "full_experiment_real.py — EXP 1-8 + verdicts H1/H2/H3 en parallèle. ~37 s.",
  },
  {
    endpoint: "/api/run/grid-search",
    title: "Grid search hyperparamètres",
    desc: "grid_search.py — 42 combos DBSCAN + 63 combos RF en parallèle. ~60 s.",
  },
  {
    endpoint: "/api/run/merge-datasets",
    title: "Re-merge des datasets",
    desc: "merge_datasets.py — concatène OWASP + Juliet. < 5 s.",
  },
] as const;

export function RunsClient() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {RUNS.map((r) => (
        <RunCard key={r.endpoint} {...r} />
      ))}
    </div>
  );
}

function RunCard({
  endpoint,
  title,
  desc,
}: {
  endpoint: string;
  title: string;
  desc: string;
}) {
  type S = "idle" | "running" | "done" | "error" | "offline";
  const [status, setStatus] = useState<S>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  async function start() {
    setStatus("running");
    setLines([]);
    setExitCode(null);
    setOpen(true);
    if (!(await checkBackend())) {
      setStatus("offline");
      return;
    }
    cleanupRef.current = streamSSE(endpoint, {
      onLine: (l) =>
        setLines((prev) => (prev.length > 4000 ? [...prev.slice(-2000), l.text] : [...prev, l.text])),
      onDone: (d) => {
        setExitCode(d.exit_code);
        setStatus(d.exit_code === 0 ? "done" : "error");
      },
      onError: () => setStatus("error"),
    });
  }

  return (
    <div className="glass border-gradient rounded-(--radius) p-5 flex flex-col gap-3">
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1.5 text-xs text-(--color-fg-muted) leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={start}
        disabled={status === "running"}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors self-start",
          status === "running"
            ? "bg-(--color-bg-elevated) text-(--color-fg-muted)"
            : "bg-(--color-fg) text-(--color-bg) hover:bg-(--color-accent)"
        )}
      >
        {status === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : status === "done" ? <Check className="w-4 h-4 text-(--color-accent)" /> : status === "error" ? <X className="w-4 h-4 text-(--color-danger)" /> : <Play className="w-4 h-4" />}
        {status === "running" ? "En cours" : status === "done" ? "Terminé · Relancer" : status === "error" ? "Erreur · Réessayer" : status === "offline" ? "Backend offline" : "Lancer"}
      </button>

      {lines.length > 0 && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-(--color-fg-muted) hover:text-(--color-fg) inline-flex items-center gap-1.5 self-start"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
          {lines.length} lignes
        </button>
      )}

      {open && lines.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
        >
          <pre className="mt-2 p-3 rounded-lg bg-(--color-bg-elevated) border border-(--color-border) font-mono text-[10px] text-(--color-fg-muted) leading-relaxed max-h-60 overflow-y-auto whitespace-pre">
            {lines.join("\n")}
            {exitCode !== null && `\n\n[exit ${exitCode}]`}
          </pre>
        </motion.div>
      )}
    </div>
  );
}
