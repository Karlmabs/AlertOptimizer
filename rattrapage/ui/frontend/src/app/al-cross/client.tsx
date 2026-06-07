"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, Loader2, Check, X, ChevronDown, TrendingUp, AlertTriangle } from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import { streamSSE, checkBackend } from "@/lib/api";
import { CHART_COLORS, tooltipStyle, axisStyle } from "@/components/chart-theme";
import type { ALCrossResults, ALCrossDirection } from "@/lib/cache";
import { cn } from "@/lib/utils";

const SRC_LABEL: Record<string, string> = { owasp_bench: "OWASP", juliet: "Juliet" };
function dirLabel(name: string) {
  const [a, b] = name.split("->");
  return `${SRC_LABEL[a] ?? a} → ${SRC_LABEL[b] ?? b}`;
}

export function ALCrossClient({ initial }: { initial: ALCrossResults | null }) {
  const router = useRouter();
  type S = "idle" | "running" | "done" | "error" | "offline";
  const [status, setStatus] = useState<S>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  async function run() {
    setStatus("running");
    setLines([]);
    setOpen(true);
    if (!(await checkBackend())) {
      setStatus("offline");
      return;
    }
    cleanupRef.current = streamSSE("/api/run/al-cross", {
      onLine: (l) =>
        setLines((prev) => (prev.length > 4000 ? [...prev.slice(-2000), l.text] : [...prev, l.text])),
      onDone: (d) => {
        setStatus(d.exit_code === 0 ? "done" : "error");
        if (d.exit_code === 0) router.refresh();
      },
      onError: () => setStatus("error"),
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="glass border-gradient rounded-(--radius) p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Exécuter l&apos;adaptation cross-dataset</div>
            <p className="mt-1 text-xs text-(--color-fg-muted)">
              <code>scripts/al_cross_dataset.py</code> — 2 directions × (incertitude + aléatoire) ×{" "}
              {initial?.config.cycles ?? 6} cycles, moyenné sur {initial?.config.seeds.length ?? 3} graines. ~140 s.
            </p>
          </div>
          <button
            onClick={run}
            disabled={status === "running"}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
              status === "running"
                ? "bg-(--color-bg-elevated) text-(--color-fg-muted)"
                : "bg-(--color-fg) text-(--color-bg) hover:bg-(--color-accent)"
            )}
          >
            {status === "running" ? (
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
              : status === "done"
                ? "Terminé · Relancer"
                : status === "error"
                  ? "Erreur · Réessayer"
                  : status === "offline"
                    ? "Backend offline"
                    : initial
                      ? "Relancer"
                      : "Lancer"}
          </button>
        </div>
        {lines.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-(--color-fg-muted) hover:text-(--color-fg) inline-flex items-center gap-1.5 self-start"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            {lines.length} lignes de log
          </button>
        )}
        {open && lines.length > 0 && (
          <pre className="mt-1 p-3 rounded-lg bg-(--color-bg-elevated) border border-(--color-border) font-mono text-[10px] text-(--color-fg-muted) leading-relaxed max-h-60 overflow-y-auto whitespace-pre">
            {lines.join("\n")}
          </pre>
        )}
      </div>

      {!initial ? (
        <div className="glass border-gradient rounded-(--radius) p-8 text-center text-(--color-fg-muted)">
          Pas encore d&apos;exécution. Clique <strong className="text-(--color-fg)">Lancer</strong> — les courbes
          d&apos;adaptation et leur lecture s&apos;afficheront ici.
        </div>
      ) : (
        <Results data={initial} />
      )}
    </div>
  );
}

function Results({ data }: { data: ALCrossResults }) {
  // headline verdicts (averaged read)
  const dirs = Object.entries(data.directions);
  const anyRandomWins = dirs.some(([, d]) => d.random_beats_uncertainty);
  const avgRecRandom = dirs.reduce((s, [, d]) => s + d.recovered_random, 0) / dirs.length;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        <VerdictCard
          ok
          icon={<TrendingUp className="w-5 h-5" />}
          title="L'adaptation fonctionne"
          big={`${Math.round(avgRecRandom * 100)}% du gap récupéré`}
          body={
            <>
              En annotant quelques centaines d&apos;alertes du nouveau dataset, le F1 remonte du zéro-shot vers la
              borne haute « tout le dataset annoté ». C&apos;est la <strong>justification du composant
              d&apos;apprentissage actif</strong> : on ne mise pas sur le transfert zéro-shot, on s&apos;adapte.
            </>
          }
        />
        <VerdictCard
          ok={false}
          icon={<AlertTriangle className="w-5 h-5" />}
          title="L'incertitude échoue sous domain shift"
          big={anyRandomWins ? "Aléatoire > Incertitude" : "Incertitude ≈ Aléatoire"}
          body={
            <>
              Contre-intuitif mais robuste sur {data.config.seeds.length} graines : sous changement de distribution,
              l&apos;échantillonnage par <strong>incertitude</strong> (efficace in-distribution) est{" "}
              <strong>battu par l&apos;aléatoire</strong>. Quand le modèle est mal calibré sur le domaine cible, les
              points « les plus incertains » sont du bruit non représentatif — un mode de défaite connu de l&apos;AL
              sous biais de covariables.
            </>
          }
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {dirs.map(([name, d]) => (
          <DirectionCard key={name} name={name} d={d} />
        ))}
      </div>

      <p className="text-[11px] text-(--color-fg-muted)">Protocole : {data.config.note}.</p>
    </>
  );
}

function DirectionCard({ name, d }: { name: string; d: ALCrossDirection }) {
  // merge the two curves into one dataset keyed by n_labels
  const points = d.uncertainty.map((u, i) => ({
    n: u.n_labels,
    uncertainty: u.f1,
    random: d.random[i]?.f1 ?? null,
  }));

  return (
    <div className="glass border-gradient rounded-(--radius) p-6">
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <h3 className="font-semibold">{dirLabel(name)}</h3>
        <span className="text-xs text-(--color-fg-muted)">
          zéro-shot <strong className="text-(--color-danger)">{d.zero_shot.f1.toFixed(3)}</strong> · plafond{" "}
          <strong className="text-(--color-accent)">{d.upper_bound.f1.toFixed(3)}</strong>
        </span>
      </div>
      <p className="text-xs text-(--color-fg-muted) mb-4">
        Récupération du gap : incertitude{" "}
        <strong style={{ color: d.recovered_uncertainty >= d.recovered_random ? CHART_COLORS.accent : CHART_COLORS.warn }}>
          {Math.round(d.recovered_uncertainty * 100)}%
        </strong>{" "}
        · aléatoire{" "}
        <strong style={{ color: d.recovered_random > d.recovered_uncertainty ? CHART_COLORS.accent : CHART_COLORS.fg }}>
          {Math.round(d.recovered_random * 100)}%
        </strong>
      </p>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" />
            <XAxis
              dataKey="n"
              {...axisStyle}
              label={{ value: "labels annotés", position: "insideBottom", offset: -2, fill: CHART_COLORS.muted, fontSize: 10 }}
            />
            <YAxis domain={[0, 1]} {...axisStyle} width={38} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              y={d.upper_bound.f1}
              stroke={CHART_COLORS.accent}
              strokeDasharray="4 4"
              label={{ value: "plafond", fill: CHART_COLORS.accent, fontSize: 9, position: "right" }}
            />
            <ReferenceLine
              y={d.zero_shot.f1}
              stroke={CHART_COLORS.danger}
              strokeDasharray="4 4"
              label={{ value: "zéro-shot", fill: CHART_COLORS.danger, fontSize: 9, position: "right" }}
            />
            <Line
              type="monotone"
              dataKey="uncertainty"
              name="Incertitude"
              stroke={CHART_COLORS.warn}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="random"
              name="Aléatoire"
              stroke={CHART_COLORS.info}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              animationDuration={600}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function VerdictCard({
  ok,
  icon,
  title,
  big,
  body,
}: {
  ok: boolean;
  icon: ReactNode;
  title: string;
  big: string;
  body: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass border-gradient rounded-(--radius) p-5 flex flex-col gap-2"
    >
      <div
        className="inline-flex items-center gap-2 text-sm font-semibold"
        style={{ color: ok ? "var(--color-accent)" : "#d9a441" }}
      >
        {icon}
        {title}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{big}</div>
      <p className="text-xs text-(--color-fg-muted) leading-relaxed">{body}</p>
    </motion.div>
  );
}
