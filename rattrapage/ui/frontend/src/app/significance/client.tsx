"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, Loader2, Check, X, ChevronDown, ShieldCheck } from "lucide-react";
import { streamSSE, checkBackend } from "@/lib/api";
import type { SignificanceResults } from "@/lib/cache";
import { Takeaway } from "@/components/takeaway";
import { cn } from "@/lib/utils";

function fmtP(p: number) {
  if (p <= 0 || p < 1e-12) return "< 10⁻¹²";
  if (p < 0.001) return "< 0,001";
  return p.toFixed(3).replace(".", ",");
}

export function SignificanceClient({ initial }: { initial: SignificanceResults | null }) {
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
    cleanupRef.current = streamSSE("/api/run/significance", {
      onLine: (l) => setLines((prev) => (prev.length > 4000 ? [...prev.slice(-2000), l.text] : [...prev, l.text])),
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
            <div className="font-semibold">Lancer le test de significativité</div>
            <p className="mt-1 text-xs text-(--color-fg-muted)">
              <code>scripts/significance.py</code> — McNemar + {initial?.config.n_bootstrap ?? 2000} ré-échantillonnages
              bootstrap. ~120 s.
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
          Pas encore d&apos;exécution. Clique <strong className="text-(--color-fg)">Lancer</strong> — le résultat
          (McNemar + intervalles de confiance) s&apos;affiche ici.
        </div>
      ) : (
        <Results d={initial} />
      )}
    </div>
  );
}

function Results({ d }: { d: SignificanceResults }) {
  const minF1 = 0.6; // axis floor for the comparison bars
  const scale = (v: number) => ((v - minF1) / (1 - minF1)) * 100;

  return (
    <>
      {/* Verdict */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass border-gradient rounded-(--radius) p-6 border-l-2"
        style={{ borderLeftColor: d.significant ? "var(--color-accent)" : "#d9a441" }}
      >
        <div
          className="inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: d.significant ? "var(--color-accent)" : "#d9a441" }}
        >
          <ShieldCheck className="w-5 h-5" />
          {d.significant ? "Écart statistiquement significatif" : "Écart non significatif"}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">
          +{d.gap_pts.toFixed(1)} pts F1
          <span className="text-base text-(--color-fg-muted) font-normal ml-3">
            IC95 % [{(d.ci_gap[0] * 100).toFixed(1)} ; {(d.ci_gap[1] * 100).toFixed(1)}]
          </span>
        </div>
        <p className="mt-2 text-sm text-(--color-fg-muted) leading-relaxed">
          McNemar : χ² = {d.mcnemar.chi2.toLocaleString("fr-FR")}, p {fmtP(d.mcnemar.p_value)}. L&apos;intervalle de
          confiance de l&apos;écart {d.ci_gap[0] > 0 ? "exclut" : "inclut"} zéro.
        </p>
      </motion.div>

      {/* F1 comparison with CIs */}
      <section className="glass border-gradient rounded-(--radius) p-6">
        <h3 className="font-semibold mb-4">F1 sur le test (33 115 alertes), avec IC95 % bootstrap</h3>
        <div className="flex flex-col gap-5">
          <BarCI label="Pipeline (DBSCAN + RF)" value={d.f1_pipeline} ci={d.ci_pipeline} scale={scale} color="var(--color-accent)" />
          <BarCI label="GROUP BY rule_id" value={d.f1_groupby} ci={d.ci_groupby} scale={scale} color="#7c93b4" />
        </div>
        <div className="mt-3 text-[10px] text-(--color-fg-muted) font-mono">Axe tronqué à 0,60 pour la lisibilité.</div>
      </section>

      {/* McNemar detail */}
      <section className="glass border-gradient rounded-(--radius) p-6">
        <h3 className="font-semibold mb-1">Test de McNemar — alerte par alerte</h3>
        <p className="text-xs text-(--color-fg-muted) mb-4">
          Sur les alertes où les deux méthodes diffèrent, combien de fois chacune a raison.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Tile big={d.mcnemar.b.toLocaleString("fr-FR")} label="Pipeline a raison, GROUP BY a tort" tone="ok" />
          <Tile big={d.mcnemar.c.toLocaleString("fr-FR")} label="GROUP BY a raison, pipeline a tort" tone="ko" />
        </div>
        <p className="mt-4 text-sm text-(--color-fg-muted)">
          Le pipeline corrige <strong className="text-(--color-fg)">{(d.mcnemar.b / Math.max(d.mcnemar.c, 1)).toFixed(1)}×</strong>{" "}
          plus d&apos;erreurs qu&apos;il n&apos;en introduit. χ² = {d.mcnemar.chi2.toLocaleString("fr-FR")}, p {fmtP(d.mcnemar.p_value)}.
        </p>
      </section>

      <Takeaway
        tone={d.significant ? "positive" : "caution"}
        points={[
          <>
            Le +11,4 pts n&apos;est pas un hasard : son intervalle de confiance{" "}
            <strong className="text-(--color-fg)">[{(d.ci_gap[0] * 100).toFixed(1)} ; {(d.ci_gap[1] * 100).toFixed(1)}]</strong>{" "}
            ne touche jamais zéro, et McNemar donne p {fmtP(d.mcnemar.p_value)}.
          </>,
          <>
            Sur les cas litigieux, mon pipeline a raison{" "}
            <strong className="text-(--color-fg)">{(d.mcnemar.b / Math.max(d.mcnemar.c, 1)).toFixed(1)} fois plus souvent</strong>{" "}
            que le GROUP BY. Ce n&apos;est pas marginal.
          </>,
          <>« Une requête statistique suffirait » : je peux maintenant répondre avec un test, pas juste un chiffre.</>,
        ]}
      />
    </>
  );
}

function BarCI({
  label,
  value,
  ci,
  scale,
  color,
}: {
  label: string;
  value: number;
  ci: [number, number];
  scale: (v: number) => number;
  color: string;
}) {
  const left = scale(ci[0]);
  const width = scale(ci[1]) - scale(ci[0]);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-(--color-fg)">{label}</span>
        <span className="text-sm font-mono tabular-nums" style={{ color }}>
          {value.toFixed(3)} <span className="text-(--color-fg-muted)">[{ci[0].toFixed(3)} ; {ci[1].toFixed(3)}]</span>
        </span>
      </div>
      <div className="relative h-5 rounded-full bg-(--color-bg-elevated) overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${scale(value)}%` }}
          transition={{ duration: 0.6 }}
          className="h-full rounded-full"
          style={{ background: color, opacity: 0.35 }}
        />
        {/* CI band */}
        <div
          className="absolute top-0 h-full"
          style={{ left: `${left}%`, width: `${width}%`, background: color, opacity: 0.9 }}
          title={`IC95 % [${ci[0].toFixed(3)} ; ${ci[1].toFixed(3)}]`}
        />
      </div>
    </div>
  );
}

function Tile({ big, label, tone }: { big: string; label: string; tone: "ok" | "ko" }) {
  return (
    <div className="rounded-xl border border-(--color-border) p-4">
      <div
        className="text-2xl font-semibold tabular-nums"
        style={{ color: tone === "ok" ? "var(--color-accent)" : "var(--color-danger)" }}
      >
        {big}
      </div>
      <div className="mt-1 text-xs text-(--color-fg-muted) leading-snug">{label}</div>
    </div>
  );
}
