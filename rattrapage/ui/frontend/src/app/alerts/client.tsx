"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, AlertTriangle, ExternalLink } from "lucide-react";
import {
  getAlerts,
  getAlertSource,
  type AlertRow,
  type AlertSource,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const FILTERS_PRED = [
  { v: undefined, label: "Tous" },
  { v: "tp", label: "TP", tone: "accent" as const, desc: "vraie vuln préservée" },
  { v: "fn", label: "FN", tone: "danger" as const, desc: "vraie vuln filtrée" },
  { v: "fp", label: "FP gardé", tone: "warn" as const, desc: "FP non filtré" },
  { v: "tn", label: "TN", tone: "accent" as const, desc: "FP filtré" },
] as const;

export function AlertsClient() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AlertRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [pred, setPred] = useState<"tp" | "fp" | "fn" | "tn" | undefined>(undefined);
  const [selected, setSelected] = useState<AlertRow | null>(null);
  const [source, setSource] = useState<AlertSource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceErr, setSourceErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced fetch on filter change
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await getAlerts({
          offset,
          limit: 50,
          q: query || undefined,
          pred,
          sort: "uncertainty",
        });
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
        if (!selected && r.items[0]) setSelected(r.items[0]);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Backend offline — lance start.sh"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, pred, offset]); // eslint-disable-line

  // Fetch source code on selection change
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setSource(null);
    setSourceErr(null);
    setSourceLoading(true);
    getAlertSource(selected.id)
      .then((s) => {
        if (cancelled) return;
        setSource(s);
      })
      .catch((e) => {
        if (cancelled) return;
        setSourceErr(e instanceof Error ? e.message : "source unavailable");
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const totalPages = Math.ceil(total / 50);
  const currentPage = Math.floor(offset / 50) + 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-5">
      {/* Left column: filters + list */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start max-h-[calc(100vh-100px)] flex flex-col">
        {/* Filters */}
        <div className="glass border-gradient rounded-(--radius) p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-(--color-fg-subtle)" />
            <input
              type="text"
              placeholder="Filtrer par rule_id ou path…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOffset(0);
              }}
              className="w-full bg-transparent border border-(--color-border) rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-(--color-fg-subtle) focus:outline-none focus:border-(--color-fg-muted)"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS_PRED.map((f) => {
              const active = pred === f.v;
              return (
                <button
                  key={f.label}
                  onClick={() => {
                    setPred(f.v as typeof pred);
                    setOffset(0);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest border transition-colors",
                    active
                      ? "bg-(--color-fg) text-(--color-bg) border-(--color-fg)"
                      : "text-(--color-fg-muted) border-(--color-border) hover:text-(--color-fg)"
                  )}
                  title={"desc" in f ? f.desc : undefined}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="text-[11px] text-(--color-fg-subtle) font-mono">
            {loading ? "…" : `${total.toLocaleString("fr-FR")} alertes`} ·
            triées par incertitude
          </div>
        </div>

        {/* List */}
        <div className="glass border-gradient rounded-(--radius) overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="overflow-y-auto flex-1">
            {error ? (
              <div className="p-5 text-sm text-(--color-danger) flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            ) : items.length === 0 && !loading ? (
              <div className="p-5 text-sm text-(--color-fg-muted)">
                Aucune alerte ne correspond aux filtres.
              </div>
            ) : (
              items.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-(--color-border) hover:bg-(--color-bg-elevated)/40 transition-colors",
                    selected?.id === a.id && "bg-(--color-bg-elevated)/60"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="font-mono text-[11px] text-(--color-fg) truncate max-w-[260px]">
                      {a.rule_id}
                    </code>
                    <Badge a={a} />
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-(--color-fg-subtle) truncate">
                    {a.file_path.split("/").slice(-2).join("/")} : {a.start_line}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-(--color-fg-muted) font-mono">
                    <span>p={a.y_prob.toFixed(2)}</span>
                    <span className={cn("uppercase", a.y_true === 0 ? "text-(--color-accent)" : "text-(--color-danger)")}>
                      {a.y_true === 0 ? "vraie vuln" : "FP réel"}
                    </span>
                    <span className="text-(--color-fg-subtle)">{a.source.replace("owasp_bench", "OWASP").replace("juliet", "Juliet")}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          {/* Pagination */}
          <div className="border-t border-(--color-border) p-3 flex items-center justify-between text-xs">
            <div className="text-(--color-fg-muted) font-mono">
              page {currentPage}/{totalPages || 1}
            </div>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
                className="px-2 py-1 rounded border border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg) disabled:opacity-30"
              >
                ‹ prev
              </button>
              <button
                disabled={offset + 50 >= total}
                onClick={() => setOffset(offset + 50)}
                className="px-2 py-1 rounded border border-(--color-border) text-(--color-fg-muted) hover:text-(--color-fg) disabled:opacity-30"
              >
                next ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right column: code viewer */}
      <div className="glass border-gradient rounded-(--radius) overflow-hidden flex flex-col min-h-[600px]">
        {!selected ? (
          <div className="p-7 text-sm text-(--color-fg-muted)">
            Sélectionne une alerte pour voir son code Java.
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-(--color-border) space-y-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <code className="font-mono text-xs md:text-sm text-(--color-fg) break-all">
                  {selected.rule_id}
                </code>
                <Badge a={selected} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <KV k="Source" v={selected.source} />
                <KV k="Niveau" v={selected.level} />
                <KV k="CWE" v={selected.test_cwe || "—"} />
                <KV k="P(FP)" v={selected.y_prob.toFixed(3)} mono />
              </div>
              <div className="font-mono text-[11px] text-(--color-fg-subtle) break-all">
                {selected.file_path} : {selected.start_line}
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-(--color-bg)/40">
              {sourceLoading ? (
                <div className="p-7 text-sm text-(--color-fg-muted) flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Chargement du code…
                </div>
              ) : sourceErr ? (
                <div className="p-7 text-sm text-(--color-danger) flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Code source indisponible</div>
                    <p className="mt-1 text-xs text-(--color-fg-muted) break-all">{sourceErr}</p>
                  </div>
                </div>
              ) : source ? (
                <CodeView source={source} highlightLine={selected.start_line} />
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ a }: { a: AlertRow }) {
  const actual_fp = a.y_true === 1;
  const pred_fp = a.y_pred === 1;
  const kind =
    !actual_fp && !pred_fp
      ? "tp"
      : actual_fp && pred_fp
        ? "tn"
        : actual_fp && !pred_fp
          ? "fp"
          : "fn";
  const conf =
    kind === "tp"
      ? { label: "TP", cls: "text-(--color-accent) bg-(--color-accent)/15 border-(--color-accent)/40" }
      : kind === "tn"
        ? { label: "TN", cls: "text-(--color-accent) bg-(--color-accent)/15 border-(--color-accent)/40" }
        : kind === "fn"
          ? { label: "FN", cls: "text-(--color-danger) bg-(--color-danger)/15 border-(--color-danger)/40" }
          : { label: "FP", cls: "text-(--color-warn) bg-(--color-warn)/15 border-(--color-warn)/40" };
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest border",
        conf.cls
      )}
    >
      {conf.label}
    </span>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        {k}
      </div>
      <div className={cn("mt-0.5", mono && "font-mono tabular-nums")}>{v}</div>
    </div>
  );
}

function CodeView({
  source,
  highlightLine,
}: {
  source: AlertSource;
  highlightLine: number;
}) {
  // Show a window around the highlighted line (±25)
  const start = Math.max(0, highlightLine - 26);
  const end = Math.min(source.lines.length, highlightLine + 25);
  return (
    <pre className="text-[12px] md:text-[13px] font-mono leading-relaxed py-4">
      {source.lines.slice(start, end).map((line, i) => {
        const lineNum = start + i + 1;
        const hl = lineNum === highlightLine;
        return (
          <div
            key={lineNum}
            id={hl ? "alert-line" : undefined}
            className={cn(
              "grid grid-cols-[60px_1fr] gap-3 px-4",
              hl && "bg-(--color-warn)/15 border-l-2 border-(--color-warn)"
            )}
          >
            <span className="text-right text-(--color-fg-subtle) select-none">
              {lineNum}
            </span>
            <span className={cn(hl && "text-(--color-fg) font-semibold")}>
              {line || " "}
            </span>
          </div>
        );
      })}
    </pre>
  );
}
