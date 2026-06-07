"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, CircleDot, AlertCircle, Loader2, ListTree, GaugeCircle, Sliders, Beaker, ShieldCheck, RotateCw } from "lucide-react";
import { WORKFLOW } from "@/lib/workflow";
import { getAllStates, subscribe, resetAll, type StepStatus } from "@/lib/workflow-store";
import { cn } from "@/lib/utils";

// `after` = the wizard step (1-indexed) that must be completed before this
// atelier becomes usable. After the reorder (grid-search → 6, pipeline → 7,
// AL → 9), the gates are :
//   - threshold / hyperparams / alerts → need workbench_state.json (written
//     as a side-effect of step 7 Pipeline)
//   - active-learning → needs the AL pool, written at the same moment
const EXTRA_TOOLS = [
  { href: "/threshold", label: "Tuner de seuil", icon: GaugeCircle, after: 7 },
  { href: "/hyperparams", label: "Atelier hyperparams", icon: Sliders, after: 7 },
  { href: "/alerts", label: "Explorer les alertes", icon: ListTree, after: 7 },
  { href: "/active-learning", label: "Labo d'AL interactif", icon: Beaker, after: 7 },
  { href: "/generalization", label: "Épreuve de généralisation", icon: ShieldCheck, after: 7 },
] as const;

export function NavSidebar() {
  const pathname = usePathname();
  const [present, setPresent] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [states, setStates] = useState(getAllStates());

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

  useEffect(() => {
    setStates(getAllStates());
    return subscribe(() => setStates(getAllStates()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch("http://127.0.0.1:8000/api/health", { cache: "no-store" });
        if (!cancelled) setApiOk(r.ok);
      } catch {
        if (!cancelled) setApiOk(false);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const completedCount = WORKFLOW.filter((s) => states[s.slug]?.status === "done").length;
  const lastDone = Math.max(
    -1,
    ...WORKFLOW.map((s, i) => (states[s.slug]?.status === "done" ? i : -1))
  );

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 flex-col h-screen sticky top-0 border-r border-(--color-border) glass transition-all duration-500 overflow-hidden",
        present ? "w-0 opacity-0" : "w-80"
      )}
      aria-hidden={present}
    >
      <div className="px-5 py-5 border-b border-(--color-border)">
        <Link href="/" className="block">
          <div className="text-[10px] text-(--color-fg-subtle) font-mono tracking-[0.2em] uppercase">
            Workbench · Wizard
          </div>
          <div className="mt-1 text-lg font-semibold tracking-tight">
            AlertOptimizer
          </div>
        </Link>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-(--color-fg-muted)">
          <div className="flex-1 h-1 rounded-full bg-(--color-bg-elevated) overflow-hidden">
            <motion.div
              className="h-full bg-(--color-accent)"
              initial={false}
              animate={{ width: `${(completedCount / WORKFLOW.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <span className="tabular-nums">
            {completedCount}/{WORKFLOW.length}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {WORKFLOW.map((step, i) => {
          const state = states[step.slug];
          const status: StepStatus = state?.status ?? "pending";
          const active = pathname === `/step/${step.slug}`;
          const accessible = i <= lastDone + 1;
          const Icon = step.icon;
          return (
            <Link
              key={step.slug}
              href={accessible ? `/step/${step.slug}` : "#"}
              onClick={(e) => {
                if (!accessible) e.preventDefault();
              }}
              className={cn(
                "relative grid grid-cols-[24px_1fr] gap-3 items-start px-2 py-2.5 rounded-lg transition-colors",
                active
                  ? "bg-(--color-bg-elevated) text-(--color-fg)"
                  : accessible
                    ? "text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-bg-elevated)/40"
                    : "text-(--color-fg-subtle) opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex flex-col items-center pt-0.5">
                <StatusDot status={status} icon={Icon} />
                {i < WORKFLOW.length - 1 && (
                  <div
                    className={cn(
                      "w-px flex-1 mt-1 min-h-[18px]",
                      status === "done"
                        ? "bg-(--color-accent)/60"
                        : "bg-(--color-border)"
                    )}
                  />
                )}
              </div>
              <div className="min-w-0 pb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] font-mono text-(--color-fg-subtle) tabular-nums">
                    {step.number.toString().padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium leading-tight">
                    {step.title}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-(--color-fg-subtle) leading-snug font-mono">
                  {step.tagline}
                </div>
              </div>
            </Link>
          );
        })}

        {/* Deep-dive tools */}
        <div className="mt-2 pt-3 border-t border-(--color-border)">
          <div className="px-2 text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-2">
            Ateliers interactifs
          </div>
          {EXTRA_TOOLS.map((t) => {
            const TIcon = t.icon;
            const enabled = lastDone + 1 >= t.after;
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={enabled ? t.href : "#"}
                onClick={(e) => {
                  if (!enabled) e.preventDefault();
                }}
                className={cn(
                  "flex items-center gap-3 px-2 py-1.5 rounded-md text-xs transition-colors",
                  active
                    ? "bg-(--color-bg-elevated) text-(--color-fg)"
                    : enabled
                      ? "text-(--color-fg-muted) hover:text-(--color-fg) hover:bg-(--color-bg-elevated)/40"
                      : "text-(--color-fg-subtle) opacity-40 cursor-not-allowed"
                )}
                title={enabled ? "" : `Disponible après l'étape ${t.after}`}
              >
                <TIcon className="w-3.5 h-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-4 py-3 border-t border-(--color-border) space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-(--color-fg-subtle) uppercase tracking-widest">Backend</span>
          <span
            className={cn(
              "inline-flex items-center gap-1",
              apiOk == null
                ? "text-(--color-fg-subtle)"
                : apiOk
                  ? "text-(--color-accent)"
                  : "text-(--color-danger)"
            )}
          >
            <CircleDot className="w-3 h-3" />
            {apiOk == null ? "…" : apiOk ? "online" : "offline"}
          </span>
        </div>
        <button
          onClick={() => {
            if (confirm("Réinitialiser tous les statuts du workflow ?")) resetAll();
          }}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[10px] text-(--color-fg-subtle) hover:text-(--color-fg) border border-(--color-border) transition-colors font-mono uppercase tracking-widest"
        >
          <RotateCw className="w-3 h-3" /> Reset progression
        </button>
        <div className="text-[10px] text-(--color-fg-subtle) font-mono leading-relaxed pt-1">
          Karl MABOU KOUAM
          <br />
          École Hexagone · 2026
        </div>
      </div>
    </aside>
  );
}

function StatusDot({ status, icon: Icon }: { status: StepStatus; icon: React.ComponentType<{ className?: string }> }) {
  if (status === "done") {
    return (
      <div className="w-6 h-6 rounded-full bg-(--color-accent)/20 border border-(--color-accent)/60 flex items-center justify-center">
        <CheckCircle2 className="w-3.5 h-3.5 text-(--color-accent)" />
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="w-6 h-6 rounded-full bg-(--color-info)/20 border border-(--color-info)/60 flex items-center justify-center">
        <Loader2 className="w-3.5 h-3.5 text-(--color-info) animate-spin" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="w-6 h-6 rounded-full bg-(--color-danger)/20 border border-(--color-danger)/60 flex items-center justify-center">
        <AlertCircle className="w-3.5 h-3.5 text-(--color-danger)" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full border border-(--color-border) flex items-center justify-center text-(--color-fg-subtle)">
      <Icon className="w-3 h-3" />
    </div>
  );
}
