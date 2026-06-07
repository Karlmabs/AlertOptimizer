"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Play, Loader2, Check, X, ChevronDown, ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { streamSSE, checkBackend } from "@/lib/api";
import type { LodoResults, LodoCell } from "@/lib/cache";
import { cn } from "@/lib/utils";

const SRC_LABEL: Record<string, string> = {
  owasp_bench: "OWASP",
  juliet: "Juliet",
};
function srcLabel(s: string) {
  return SRC_LABEL[s] ?? s;
}

/** Colour a F1 score from red (0.4) → amber (0.7) → green (0.9). */
function f1Color(f1: number) {
  if (f1 >= 0.82) return "var(--color-accent)";
  if (f1 >= 0.65) return "#d9a441";
  return "var(--color-danger)";
}

export function GeneralizationClient({ initial }: { initial: LodoResults | null }) {
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
    cleanupRef.current = streamSSE("/api/run/lodo", {
      onLine: (l) =>
        setLines((prev) => (prev.length > 4000 ? [...prev.slice(-2000), l.text] : [...prev, l.text])),
      onDone: (d) => {
        setStatus(d.exit_code === 0 ? "done" : "error");
        if (d.exit_code === 0) router.refresh(); // re-read the regenerated JSON server-side
      },
      onError: () => setStatus("error"),
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <RunBar status={status} onRun={run} lines={lines} open={open} setOpen={setOpen} hasData={!!initial} />

      {!initial ? (
        <div className="glass border-gradient rounded-(--radius) p-8 text-center text-(--color-fg-muted)">
          Pas encore d&apos;exécution. Clique <strong className="text-(--color-fg)">Lancer</strong> — le script
          entraîne 10 modèles (3 graines × matrice LODO + ablation) en ~90 s, puis les résultats et leur lecture
          s&apos;affichent ici.
        </div>
      ) : (
        <Results data={initial} />
      )}
    </div>
  );
}

function RunBar({
  status,
  onRun,
  lines,
  open,
  setOpen,
  hasData,
}: {
  status: string;
  onRun: () => void;
  lines: string[];
  open: boolean;
  setOpen: (v: boolean) => void;
  hasData: boolean;
}) {
  return (
    <div className="glass border-gradient rounded-(--radius) p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold">Exécuter l&apos;épreuve de généralisation</div>
          <p className="mt-1 text-xs text-(--color-fg-muted)">
            <code>scripts/lodo_ablation.py</code> — matrice train×test + ablation rule.id, 3 graines. ~90 s.
            Seuil choisi sur le train (aucune fuite vers le test).
          </p>
        </div>
        <button
          onClick={onRun}
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
                  : hasData
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
  );
}

function Results({ data }: { data: LodoResults }) {
  const sources = data.config.sources;
  const m = data.lodo_matrix;
  const s = data.lodo_summary;
  const ab = data.ablation;

  return (
    <>
      {/* ---- Verdict cards (interpretation, readable during the defense) ---- */}
      <div className="grid md:grid-cols-2 gap-4">
        <VerdictCard
          ok={s.generalizes}
          okIcon={<ShieldCheck className="w-5 h-5" />}
          koIcon={<ShieldAlert className="w-5 h-5" />}
          title={s.generalizes ? "Généralisation robuste" : "Généralisation limitée (zéro-shot)"}
          big={`ΔF1 = ${s.gap_f1 >= 0 ? "+" : ""}${s.gap_f1.toFixed(3)}`}
          body={
            s.generalizes ? (
              <>
                L&apos;écart entre évaluation <em>in-distribution</em> ({s.in_distribution_f1.toFixed(3)}) et{" "}
                <em>cross-dataset</em> ({s.cross_dataset_f1.toFixed(3)}) est faible : le modèle transfère d&apos;un
                benchmark à l&apos;autre.
              </>
            ) : (
              <>
                In-distribution F1={s.in_distribution_f1.toFixed(3)} mais cross-dataset F1=
                {s.cross_dataset_f1.toFixed(3)}. Le modèle apprend des patterns <strong>spécifiques au benchmark</strong>{" "}
                et ne transfère pas en zéro-shot. C&apos;est <strong>attendu</strong> : les faux positifs SAST sont
                connus pour être propres au projet/outil — et c&apos;est précisément la <strong>raison d&apos;être de
                l&apos;apprentissage actif</strong> (s&apos;adapter avec quelques labels au lieu d&apos;espérer du
                zéro-shot).
              </>
            )
          }
        />
        <VerdictCard
          ok={ab.not_a_lookup_table}
          okIcon={<ShieldCheck className="w-5 h-5" />}
          koIcon={<ShieldAlert className="w-5 h-5" />}
          title={ab.not_a_lookup_table ? "Pas une table de correspondance" : "Forte dépendance à rule.id"}
          big={`F1 sans rule.id = ${ab.pooled_without_rule.f1.toFixed(3)}`}
          body={
            <>
              En neutralisant <code>rule.id</code> complètement, le F1 passe de{" "}
              <strong className="text-(--color-fg)">{ab.pooled_with_rule.f1.toFixed(3)}</strong> à{" "}
              <strong className="text-(--color-fg)">{ab.pooled_without_rule.f1.toFixed(3)}</strong> (ROC{" "}
              {ab.pooled_with_rule.roc_auc.toFixed(3)} → {ab.pooled_without_rule.roc_auc.toFixed(3)}).{" "}
              {ab.not_a_lookup_table
                ? "Le modèle conserve l'essentiel de son pouvoir discriminant via les autres features (occurrenceCount, taint, cluster) — donc ce n'est pas un simple dictionnaire de règles."
                : "Le modèle s'écroule sans rule.id."}
            </>
          }
        />
      </div>

      {/* ---- LODO matrix ---- */}
      <section className="glass border-gradient rounded-(--radius) p-6">
        <h3 className="font-semibold mb-1">Matrice de généralisation (F1 ± σ sur {data.config.seeds.length} graines)</h3>
        <p className="text-xs text-(--color-fg-muted) mb-5">
          Diagonale = entraîné et testé sur le <strong>même</strong> dataset (in-distribution). Hors-diagonale ={" "}
          <strong>cross-dataset</strong> (la vraie épreuve). La feature <code>source</code> est neutralisée partout.
        </p>

        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-2">
            <thead>
              <tr>
                <th className="text-xs text-(--color-fg-muted) font-normal text-left px-2">
                  Train ↓ / Test →
                </th>
                {sources.map((ts) => (
                  <th key={ts} className="text-xs text-(--color-fg) font-medium px-2">
                    {srcLabel(ts)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((tr) => (
                <tr key={tr}>
                  <td className="text-xs text-(--color-fg) font-medium px-2 whitespace-nowrap">{srcLabel(tr)}</td>
                  {sources.map((te) => {
                    const cell = m[`${tr}->${te}`] as LodoCell | undefined;
                    if (!cell) return <td key={te} />;
                    return (
                      <td key={te}>
                        <MatrixCell cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <SummaryTile
            label="Moyenne in-distribution"
            f1={s.in_distribution_f1}
            roc={s.in_distribution_roc}
            tone="ok"
          />
          <SummaryTile label="Moyenne cross-dataset" f1={s.cross_dataset_f1} roc={s.cross_dataset_roc} tone="ko" />
        </div>
      </section>

      {/* ---- Ablation per cell ---- */}
      <section className="glass border-gradient rounded-(--radius) p-6">
        <h3 className="font-semibold mb-1">Ablation sans rule.id — par cellule</h3>
        <p className="text-xs text-(--color-fg-muted) mb-5">
          Δ = F1(avec rule.id) − F1(sans). Un Δ ≈ 0 (ou négatif) en cross-dataset confirme qu&apos;il n&apos;existe
          pas de table de règles transférable : <code>rule.id</code> y est du bruit.
        </p>
        <div className="flex flex-col gap-3">
          {Object.entries(ab.per_cell).map(([name, c]) => {
            const [tr, te] = name.split("->");
            return (
              <div key={name} className="flex items-center gap-3 flex-wrap">
                <div className="text-xs text-(--color-fg) w-44 flex items-center gap-1.5">
                  {srcLabel(tr)} <ArrowRight className="w-3 h-3 text-(--color-fg-muted)" /> {srcLabel(te)}
                  <span className="text-(--color-fg-muted)">
                    ({c.kind === "in-distribution" ? "in-distrib" : "cross"})
                  </span>
                </div>
                <Bar label="avec" value={c.with_rule} color="var(--color-fg)" />
                <Bar label="sans" value={c.without_rule} color="#7c93b4" />
                <div
                  className="text-xs font-mono w-20 text-right"
                  style={{ color: Math.abs(c.delta_f1) < 0.05 ? "var(--color-accent)" : "var(--color-fg-muted)" }}
                >
                  Δ {c.delta_f1 >= 0 ? "+" : ""}
                  {c.delta_f1.toFixed(3)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-(--color-fg-muted)">
        Protocole : {data.config.note_threshold}. {data.config.note_source_off}.
      </p>
    </>
  );
}

function MatrixCell({ cell }: { cell: LodoCell }) {
  const isDiag = cell.kind === "in-distribution";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-xl px-4 py-3 min-w-32 text-center border",
        isDiag ? "border-(--color-border)" : "border-dashed border-(--color-border)"
      )}
      style={{ background: "color-mix(in oklab, " + f1Color(cell.f1) + " 14%, transparent)" }}
    >
      <div className="text-xl font-semibold tabular-nums" style={{ color: f1Color(cell.f1) }}>
        {cell.f1.toFixed(3)}
      </div>
      <div className="text-[10px] text-(--color-fg-muted) mt-0.5">
        ±{cell.f1_std.toFixed(3)} · ROC {cell.roc_auc.toFixed(2)}
      </div>
      <div className="text-[10px] text-(--color-fg-muted)">
        {isDiag ? "in-distribution" : "cross-dataset"}
      </div>
    </motion.div>
  );
}

function SummaryTile({
  label,
  f1,
  roc,
  tone,
}: {
  label: string;
  f1: number;
  roc: number;
  tone: "ok" | "ko";
}) {
  return (
    <div className="rounded-xl border border-(--color-border) p-4">
      <div className="text-xs text-(--color-fg-muted)">{label}</div>
      <div className="flex items-baseline gap-3 mt-1">
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: tone === "ok" ? "var(--color-accent)" : "var(--color-danger)" }}
        >
          {f1.toFixed(3)}
        </span>
        <span className="text-xs text-(--color-fg-muted)">F1 · ROC {roc.toFixed(3)}</span>
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-40">
      <span className="text-[10px] text-(--color-fg-muted) w-8">{label}</span>
      <div className="flex-1 h-4 rounded-full bg-(--color-bg-elevated) overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
          transition={{ duration: 0.6 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-[10px] font-mono w-10 text-right text-(--color-fg)">{value.toFixed(3)}</span>
    </div>
  );
}

function VerdictCard({
  ok,
  okIcon,
  koIcon,
  title,
  big,
  body,
}: {
  ok: boolean;
  okIcon: ReactNode;
  koIcon: ReactNode;
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
        {ok ? okIcon : koIcon}
        {title}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{big}</div>
      <p className="text-xs text-(--color-fg-muted) leading-relaxed">{body}</p>
    </motion.div>
  );
}
