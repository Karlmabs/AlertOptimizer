"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  Clock,
  Terminal,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import {
  type WorkflowStep as Step,
  getStep,
  nextStep,
  prevStep,
} from "@/lib/workflow";
import {
  getStepState,
  setStepState,
  subscribe,
} from "@/lib/workflow-store";
import { streamSSE, API, checkBackend } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Takeaway } from "@/components/takeaway";

const FR = new Intl.NumberFormat("fr-FR");

type Phase = "brief" | "running" | "done" | "error";

export function WorkflowStep({ slug }: { slug: string }) {
  const step = getStep(slug);
  if (!step) return null;
  return <WorkflowStepInner step={step} />;
}

function WorkflowStepInner({ step }: { step: Step }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("brief");
  const [inheritedHint, setInheritedHint] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, number | string | boolean>>(
    () => Object.fromEntries((step.parameters ?? []).map((p) => [p.key, p.default]))
  );

  // Inherit defaults from a previous step's result (e.g. Pipeline reads
  // best params from Grid Search). Only applies before the user has run
  // this step themselves.
  useEffect(() => {
    const cur = getStepState(step.slug);
    if (cur.status === "done") return; // user already ran, keep their params

    if (step.inheritDefaultsFrom) {
      const src = getStepState(step.inheritDefaultsFrom.stepSlug);
      if (src.status === "done" && src.result) {
        const overrides: Record<string, number | string | boolean> = {};
        for (const [paramKey, resultPath] of Object.entries(
          step.inheritDefaultsFrom.mapping
        )) {
          const v = getByPath(src.result, resultPath);
          if (v !== undefined && v !== null) {
            overrides[paramKey] = v as number | string | boolean;
          }
        }
        if (Object.keys(overrides).length > 0) {
          setParams((prev) => ({ ...prev, ...overrides }));
          setInheritedHint(
            `Paramètres pré-remplis avec les meilleurs trouvés à l'étape ${
              step.inheritDefaultsFrom!.stepSlug
            }`
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.slug]);
  const [logs, setLogs] = useState<string[]>([]);
  const [narrationIndex, setNarrationIndex] = useState(0);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const logScroll = useRef<HTMLDivElement>(null);
  // Captured as soon as a `RESULT: {...}` line is streamed, so onDone has fresh data.
  const resultRef = useRef<Record<string, unknown> | null>(null);

  // Rehydrate from localStorage
  useEffect(() => {
    const s = getStepState(step.slug);
    if (s.status === "done" && s.result) {
      setPhase("done");
      setResult(s.result);
      if (s.params)
        setParams((prev) => ({ ...prev, ...(s.params as typeof prev) }));
    }
    return subscribe(() => {
      // External reset?
      const cur = getStepState(step.slug);
      if (cur.status === "pending" && phase === "done") {
        setPhase("brief");
        setResult(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.slug]);

  // Drive the narration index slowly during running phase
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      setNarrationIndex((i) => Math.min(i + 1, step.narration.length - 1));
    }, 1800);
    return () => clearInterval(id);
  }, [phase, step.narration.length]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logScroll.current) {
      logScroll.current.scrollTop = logScroll.current.scrollHeight;
    }
  }, [logs]);

  // Cleanup SSE on unmount
  useEffect(() => () => cleanupRef.current?.(), []);

  async function start() {
    setError(null);
    setLogs([]);
    setNarrationIndex(0);
    setResult(null);
    setElapsedMs(null);
    resultRef.current = null;
    setStepState(step.slug, { status: "running", params: { ...params } });
    setPhase("running");

    if (!step.endpoint) {
      // Special case: step 10 (Verdicts) is computed client-side from previous results
      const computed = computeVerdicts();
      finish(computed);
      return;
    }

    const ok = await checkBackend();
    if (!ok) {
      setError(
        "Le backend FastAPI est offline. Lance ./rattrapage/ui/backend/start.sh dans un terminal."
      );
      setPhase("error");
      setStepState(step.slug, { status: "error" });
      return;
    }

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
    const url = `${step.endpoint}${qs.toString() ? "?" + qs.toString() : ""}`;

    const t0 = performance.now();
    cleanupRef.current = streamSSE(url, {
      onLine: (l) => {
        // Capture structured result lines as they stream so onDone has fresh data.
        const m = l.text.match(/^RESULT:\s*(\{.*\})$/);
        if (m) {
          try {
            resultRef.current = JSON.parse(m[1]);
          } catch {
            // ignore malformed
          }
        }
        setLogs((prev) =>
          prev.length > 4000 ? [...prev.slice(-2000), l.text] : [...prev, l.text]
        );
      },
      onDone: (d) => {
        setElapsedMs(performance.now() - t0);
        if (resultRef.current) finish(resultRef.current);
        else finish({ exit_code: d.exit_code });
      },
      onError: () => {
        setError("Erreur durant l'exécution du script (voir log).");
        setPhase("error");
        setStepState(step.slug, { status: "error" });
      },
    });
  }

  function finish(r: Record<string, unknown>) {
    setResult(r);
    setPhase("done");
    setStepState(step.slug, {
      status: "done",
      result: r,
      params: { ...params },
      finishedAt: new Date().toISOString(),
    });
  }

  function computeVerdicts(): Record<string, unknown> {
    // Read previous steps from localStorage and apply the criteria
    const pipeline = getStepState("pipeline").result as
      | { metrics?: { reduction: number; recall: number; f1: number }; }
      | undefined;
    const baselines = getStepState("baselines").result as
      | { pipeline?: { f1: number }; rf_only?: { f1: number } }
      | undefined;
    const al = getStepState("active-learning").result as
      | { perfect?: { delta: number }; noisy?: { delta: number } }
      | undefined;

    const red = pipeline?.metrics?.reduction ?? 0;
    const rec = pipeline?.metrics?.recall ?? 0;
    const d_dbscan = (baselines?.pipeline?.f1 ?? 0) - (baselines?.rf_only?.f1 ?? 0);
    const al_p = al?.perfect?.delta ?? 0;
    const al_n = al?.noisy?.delta ?? 0;
    return {
      H1: red > 0.5 && rec >= 0.85 ? "VALIDÉE" : "NON VALIDÉE",
      H2: d_dbscan >= 0.05 ? "VALIDÉE" : "NON VALIDÉE",
      H3_perfect: al_p >= 0.03 ? "VALIDÉE" : "NON VALIDÉE",
      H3_noisy: al_n >= 0.03 ? "VALIDÉE" : "NON VALIDÉE",
    };
  }

  function reset() {
    cleanupRef.current?.();
    setPhase("brief");
    setResult(null);
    setLogs([]);
    setError(null);
    setStepState(step.slug, { status: "pending" });
  }

  const next = nextStep(step.slug);
  const prev = prevStep(step.slug);

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-6xl mx-auto w-full">
      {/* Step header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-(--color-fg-subtle)">
          <span>Étape {step.number.toString().padStart(2, "0")} / 10</span>
          <span className="text-(--color-fg-subtle)">·</span>
          <Clock className="w-3 h-3" />
          <span>{step.duration}</span>
          {step.warning && (
            <>
              <span className="text-(--color-fg-subtle)">·</span>
              <span className="inline-flex items-center gap-1 text-(--color-warn)">
                <AlertTriangle className="w-3 h-3" /> {step.warning}
              </span>
            </>
          )}
        </div>
        <h1 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight num-gradient">
          {step.title}
        </h1>
        <p className="mt-4 text-base md:text-lg text-(--color-fg-muted) max-w-3xl leading-relaxed">
          {step.brief}
        </p>
      </motion.div>

      {/* Phase content */}
      <AnimatePresence mode="wait">
        {phase === "brief" && (
          <motion.section
            key="brief"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Parameters */}
            {step.parameters && step.parameters.length > 0 && (
              <div className="glass border-gradient rounded-(--radius) p-6">
                <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
                    Paramètres à appliquer
                  </div>
                  {inheritedHint && (
                    <div className="text-[10px] font-mono text-(--color-accent) inline-flex items-center gap-1.5">
                      <Lightbulb className="w-3 h-3" />
                      {inheritedHint}
                    </div>
                  )}
                </div>
                <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                  {step.parameters.map((p) => (
                    <ParamInput
                      key={p.key}
                      def={p}
                      value={params[p.key] as never}
                      onChange={(v) => setParams({ ...params, [p.key]: v })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* What will happen */}
            <div className="glass border-gradient rounded-(--radius) p-6">
              <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-3 flex items-center gap-2">
                <Lightbulb className="w-3 h-3" /> Ce qui va se passer
              </div>
              <ol className="space-y-2 text-sm text-(--color-fg-muted) list-decimal pl-5">
                {step.narration.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>

            {/* Action */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={start}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-(--color-fg) text-(--color-bg) font-medium hover:bg-(--color-accent) transition-colors"
              >
                <Play className="w-4 h-4" />
                Lancer l&apos;étape {step.number}
              </button>
              {prev && (
                <Link
                  href={`/step/${prev.slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm text-(--color-fg-muted) border border-(--color-border) hover:text-(--color-fg)"
                >
                  <ArrowLeft className="w-4 h-4" /> Étape précédente
                </Link>
              )}
            </div>
          </motion.section>
        )}

        {phase === "running" && (
          <motion.section
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Live narration */}
            <div className="glass border-gradient rounded-(--radius) p-7 md:p-9">
              <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-4 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin text-(--color-info)" />
                En cours d&apos;exécution
              </div>
              <ul className="space-y-3">
                {step.narration.map((line, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-3 text-base transition-colors duration-500",
                      i > narrationIndex && "text-(--color-fg-subtle)",
                      i === narrationIndex && "text-(--color-fg)",
                      i < narrationIndex && "text-(--color-fg-muted)"
                    )}
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full mt-2 shrink-0 transition-colors duration-500",
                        i < narrationIndex
                          ? "bg-(--color-accent)"
                          : i === narrationIndex
                            ? "bg-(--color-info) pulse-glow"
                            : "bg-(--color-fg-subtle)/40"
                      )}
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Live log */}
            {logs.length > 0 && (
              <div className="glass border-gradient rounded-(--radius) overflow-hidden">
                <button
                  onClick={() => setLogOpen((v) => !v)}
                  className="w-full px-5 py-3 flex items-center justify-between text-xs text-(--color-fg-muted) hover:text-(--color-fg)"
                >
                  <span className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5" />
                    <span className="font-mono uppercase tracking-widest">
                      Log · {logs.length} lignes
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 transition-transform", logOpen && "rotate-180")}
                  />
                </button>
                {logOpen && (
                  <div
                    ref={logScroll}
                    className="px-5 pb-4 font-mono text-[11px] text-(--color-fg-muted) max-h-72 overflow-y-auto whitespace-pre"
                  >
                    {logs.join("\n")}
                  </div>
                )}
              </div>
            )}
          </motion.section>
        )}

        {phase === "done" && result && (
          <motion.section
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Result summary */}
            <div className="glass border-gradient rounded-(--radius) p-7 glow-accent">
              <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-accent) mb-2 flex items-center gap-2">
                <Check className="w-3.5 h-3.5" />
                Étape terminée
                {elapsedMs && (
                  <span className="text-(--color-fg-subtle) ml-1">
                    · {(elapsedMs / 1000).toFixed(1)} s
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-5">
                Résultats de l&apos;étape {step.number}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {step.outputParams.map((p) => (
                  <ResultTile
                    key={p.path}
                    label={p.label}
                    value={getByPath(result, p.path)}
                    format={p.format}
                    digits={p.digits}
                  />
                ))}
              </div>
            </div>

            {/* Conclusion — what these numbers mean */}
            {step.conclusion && (
              <Takeaway tone="positive" title="Conclusion de l'étape">
                {step.conclusion}
              </Takeaway>
            )}

            {/* Parameters used */}
            {step.parameters && step.parameters.length > 0 && (
              <div className="glass border-gradient rounded-(--radius) p-6">
                <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-3">
                  Paramètres utilisés
                </div>
                <div className="flex flex-wrap gap-2">
                  {step.parameters.map((p) => (
                    <span
                      key={p.key}
                      className="px-2.5 py-1 rounded-full bg-(--color-bg-elevated) border border-(--color-border) text-[11px] font-mono"
                    >
                      <span className="text-(--color-fg-subtle)">{p.label} =</span>{" "}
                      <span className="text-(--color-fg)">{String(params[p.key])}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Deep dives */}
            {step.deepDives && step.deepDives.length > 0 && (
              <div className="glass border-gradient rounded-(--radius) p-6">
                <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-3">
                  Approfondir avec les ateliers interactifs
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {step.deepDives.map((d) => (
                    <Link
                      key={d.href}
                      href={d.href}
                      className="group glass-strong border-gradient rounded-(--radius) p-4 hover:bg-(--color-bg-elevated) transition-colors"
                    >
                      <div className="font-medium flex items-center gap-2">
                        {d.label}
                        <ArrowRight className="w-3.5 h-3.5 text-(--color-fg-subtle) group-hover:translate-x-0.5 group-hover:text-(--color-fg) transition" />
                      </div>
                      <p className="mt-1 text-xs text-(--color-fg-muted)">
                        {d.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-4">
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs text-(--color-fg-muted) border border-(--color-border) hover:text-(--color-fg)"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Re-lancer cette étape
              </button>
              {next && (
                <Link
                  href={`/step/${next.slug}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-(--color-fg) text-(--color-bg) font-medium hover:bg-(--color-accent) transition-colors"
                >
                  Continuer vers l&apos;étape {next.number} : {next.short}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </motion.section>
        )}

        {phase === "error" && (
          <motion.section
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="glass border border-(--color-danger)/40 rounded-(--radius) p-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-(--color-danger) shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-(--color-danger)">Échec de l&apos;étape</div>
                <p className="mt-2 text-sm text-(--color-fg-muted)">{error}</p>
              </div>
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm bg-(--color-fg) text-(--color-bg) font-medium"
            >
              <RotateCcw className="w-4 h-4" /> Retour au brief
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function ParamInput({
  def,
  value,
  onChange,
}: {
  def: NonNullable<Step["parameters"]>[number];
  value: number | string | boolean;
  onChange: (v: number | string | boolean) => void;
}) {
  if (def.type === "select" && def.options) {
    return (
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-1.5">
          {def.label}
        </div>
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border border-(--color-border) rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-(--color-fg-muted)"
        >
          {def.options.map((o) => (
            <option key={o.value} value={o.value} className="bg-(--color-bg)">
              {o.label}
            </option>
          ))}
        </select>
        {def.description && (
          <div className="mt-1 text-[11px] text-(--color-fg-subtle) leading-snug">
            {def.description}
          </div>
        )}
      </div>
    );
  }
  if (def.type === "number") {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
            {def.label}
          </div>
          <div className="text-xs font-mono tabular-nums text-(--color-fg)">{String(value)}</div>
        </div>
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        {def.description && (
          <div className="mt-1 text-[11px] text-(--color-fg-subtle) leading-snug">
            {def.description}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function ResultTile({
  label,
  value,
  format,
  digits,
}: {
  label: string;
  value: unknown;
  format?: "int" | "float" | "pct" | "string";
  digits?: number;
}) {
  const v =
    value == null
      ? "—"
      : format === "int"
        ? FR.format(Math.round(Number(value)))
        : format === "pct"
          ? `${(Number(value) * 100).toFixed(digits ?? 1)} %`
          : format === "float"
            ? Number(value).toFixed(digits ?? 3)
            : String(value);
  return (
    <div className="glass-strong border-gradient rounded-(--radius) p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums num-gradient leading-none">
        {v}
      </div>
    </div>
  );
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}
