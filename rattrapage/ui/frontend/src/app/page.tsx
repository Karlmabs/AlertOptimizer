import Link from "next/link";
import {
  ArrowRight,
  GaugeCircle,
  Sliders,
  Beaker,
  ListTree,
  Database,
  Play,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MetricTile } from "@/components/metric-tile";
import { tryReadWorkbenchState } from "@/lib/cache";

const SHORTCUTS = [
  {
    href: "/threshold",
    icon: GaugeCircle,
    title: "Tuner de seuil",
    desc: "Slider live · 0 latence · confusion matrix qui re-colore en direct",
    tone: "accent",
  },
  {
    href: "/hyperparams",
    icon: Sliders,
    title: "Atelier hyperparamètres",
    desc: "ε / MinPts / n_estimators / max_depth · retrain ~ 4 s",
    tone: "info",
  },
  {
    href: "/alerts",
    icon: ListTree,
    title: "Explorateur d'alertes",
    desc: "Drill-down sur 33 115 alertes avec le code Java surligné",
    tone: "warn",
  },
  {
    href: "/active-learning",
    icon: Beaker,
    title: "Labo d'apprentissage actif",
    desc: "Tu joues l'oracle, le modèle se ré-entraîne cycle par cycle",
    tone: "accent",
  },
  {
    href: "/generalization",
    icon: ShieldCheck,
    title: "Épreuve de généralisation",
    desc: "LODO cross-dataset + ablation rule.id · le test qui répond au jury",
    tone: "info",
  },
  {
    href: "/al-cross",
    icon: TrendingUp,
    title: "Adaptation cross-dataset",
    desc: "L'AL récupère le gap · incertitude vs aléatoire",
    tone: "warn",
  },
  {
    href: "/dataset",
    icon: Database,
    title: "Dataset",
    desc: "66 227 alertes · 58 règles · OWASP Benchmark + NIST Juliet",
    tone: "info",
  },
  {
    href: "/runs",
    icon: Play,
    title: "Exécutions complètes",
    desc: "Lance les 8 EXP ou le grid search en stream live",
    tone: "warn",
  },
] as const;

const TONE = {
  accent: "text-(--color-accent) bg-(--color-accent)/10",
  info: "text-(--color-info) bg-(--color-info)/10",
  warn: "text-(--color-warn) bg-(--color-warn)/10",
};

export default async function Overview() {
  const state = await tryReadWorkbenchState();
  const m = state?.default.metrics;
  const hasData = !!state;

  return (
    <div className="relative">
      <div className="absolute inset-0 grid-bg pointer-events-none opacity-30" />
      <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-(--color-accent)/10 blur-3xl pointer-events-none -translate-y-1/3 translate-x-1/4" />

      <div className="relative px-6 md:px-12 lg:px-16 py-10 md:py-14 max-w-7xl mx-auto">
        <PageHeader
          eyebrow="Workbench · AlertOptimizer"
          title="Mon workbench — tout est jouable en direct"
          intro={
            <>
              J&apos;ai construit cet outil pour travailler, pas pour faire joli. Vous pouvez tout
              manipuler : déplacer un seuil, changer un hyperparamètre, ouvrir une alerte pour voir
              son code. Les chiffres ci-dessous, c&apos;est ma config par défaut sur les données réelles.
            </>
          }
        />

        {/* Key metrics — only if step 6 has been run at least once */}
        {hasData && state && m ? (
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-12">
            <MetricTile label="Alertes test" value={state.test.n} decimals={0} />
            <MetricTile label="F1-Score" value={m.f1} accent />
            <MetricTile label="ROC-AUC" value={state.default.roc_auc} accent />
            <MetricTile label="Précision" value={m.precision} />
            <MetricTile label="Rappel" value={m.recall} />
            <MetricTile label="Réduction" value={m.reduction * 100} decimals={1} suffix=" %" accent />
          </section>
        ) : (
          <section className="glass border-gradient rounded-(--radius) p-7 mb-12 text-center">
            <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-warn) mb-2">
              Aucune donnée pré-générée
            </div>
            <p className="text-sm text-(--color-fg-muted) max-w-2xl mx-auto leading-relaxed">
              Le workspace est vierge. Lance le wizard à partir de l&apos;étape 1 pour
              tout reconstruire depuis zéro. Les chiffres apparaîtront ici une fois
              l&apos;étape 6 (Pipeline) terminée.
            </p>
            <Link
              href="/step/sources"
              className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-full bg-(--color-fg) text-(--color-bg) font-medium text-sm hover:bg-(--color-accent) transition-colors"
            >
              Commencer le wizard
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        )}

        {/* Fil rouge — les 3 critiques du jury → les 3 réponses */}
        <h2 className="text-sm font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-4">
          Le fil rouge — réponse aux 3 critiques du jury
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {[
            {
              n: "01",
              crit: "« Dataset synthétique → le modèle redécouvre ce que tu as programmé. »",
              ans: "J'ai tout refait sur 66 227 alertes réelles (OWASP + NIST Juliet). Les labels viennent d'eux, pas de moi.",
              proof: "F1 0,801 → 0,874",
            },
            {
              n: "02",
              crit: "« rule.id à 81,7 % = une simple table de correspondance. »",
              ans: "Sur le réel, rule.id tombe à 49 %. Et même sans rule.id, le modèle tient (F1 0,72). Voir l'atelier Généralisation.",
              proof: "81,7 % → 49,1 %",
            },
            {
              n: "03",
              crit: "« Un simple GROUP BY rule_id suffirait. »",
              ans: "Sur 66 k alertes, mon pipeline bat le GROUP BY de 11 points de F1. À cette échelle, le ML gagne. Voir Baselines.",
              proof: "+11,4 pts F1",
            },
          ].map((c) => (
            <div key={c.n} className="glass border-gradient rounded-(--radius) p-5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-(--color-fg-subtle)">{c.n}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-(--color-danger)">
                  Critique
                </span>
              </div>
              <p className="text-xs text-(--color-fg-muted) italic leading-relaxed">{c.crit}</p>
              <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-accent) mt-1">
                Réponse
              </div>
              <p className="text-sm text-(--color-fg) leading-relaxed">{c.ans}</p>
              <div className="mt-auto pt-2 text-lg font-semibold tabular-nums text-(--color-accent)">
                {c.proof}
              </div>
            </div>
          ))}
        </div>

        {/* Shortcut tiles */}
        <h2 className="text-sm font-mono uppercase tracking-widest text-(--color-fg-subtle) mb-4">
          Ateliers
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group glass border-gradient rounded-(--radius) p-5 md:p-6 transition-colors hover:bg-(--color-bg-elevated) flex flex-col gap-3"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${TONE[s.tone]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {s.title}
                    <ArrowRight className="w-4 h-4 text-(--color-fg-subtle) group-hover:translate-x-0.5 group-hover:text-(--color-fg) transition" />
                  </div>
                  <p className="mt-1.5 text-sm text-(--color-fg-muted) leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-12 text-xs text-(--color-fg-subtle) text-center font-mono">
          Karl MABOU KOUAM · Master 2 Expert en Ingénierie Informatique · École Hexagone · 2026
        </div>
      </div>
    </div>
  );
}
