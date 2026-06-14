import { PageHeader } from "@/components/page-header";
import { MetricTile } from "@/components/metric-tile";

export default function DatasetPage() {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Dataset"
        title="66 227 alertes labellisées par OWASP et NIST"
        intro="J'ai scanné 49 543 fichiers Java avec Semgrep (6 rulesets publics). Chaque alerte reçoit son label TP/FP par jointure avec la table de vérité OWASP (expectedresults-1.2.csv) ou NIST (manifest.xml)."
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <MetricTile label="Alertes" value={66227} decimals={0} />
        <MetricTile label="Règles" value={58} decimals={0} />
        <MetricTile label="Taux FP" value={67.8} decimals={1} suffix=" %" />
        <MetricTile label="Sources" value={2} decimals={0} />
      </section>

      <section className="grid md:grid-cols-2 gap-5">
        <Card
          title="OWASP Benchmark Java v1.2"
          source="Fondation OWASP"
          stats={[
            ["2 740", "fichiers Java"],
            ["8 043", "alertes Semgrep"],
            ["11", "catégories vuln."],
          ]}
          desc="Chaque BenchmarkTestNNNNN.java a un label `real_vulnerability` déterministe. Quand Semgrep fire sur un fichier vulnérable avec une CWE matchante, l'alerte est TP — sinon FP."
        />
        <Card
          title="NIST Juliet Test Suite Java v1.3"
          source="NIST SARD"
          stats={[
            ["46 803", "fichiers Java"],
            ["58 184", "alertes Semgrep"],
            ["112", "CWE couvertes"],
          ]}
          desc="Le manifest.xml liste les lignes exactes où se trouve la vulnérabilité dans chaque fichier. Labellisation par CWE matching + dossier de catégorie."
        />
      </section>

      <section className="mt-10 glass border-gradient rounded-(--radius) p-6 text-sm text-(--color-fg-muted) leading-relaxed">
        <strong className="text-(--color-fg)">Pourquoi c&apos;est défendable :</strong> les deux sources sont
        publiques, leurs labels existaient avant mon mémoire, et n&apos;importe qui peut refaire la jointure.
        Mes scripts <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-(--color-bg-elevated)">build_dataset_juliet.py</code>{" "}
        et <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-(--color-bg-elevated)">build_dataset_owasp_enriched.py</code>{" "}
        régénèrent <code className="font-mono text-xs">real_dataset_v2.csv</code> en moins de 10 s depuis les SARIF bruts.
      </section>
    </div>
  );
}

function Card({
  title,
  source,
  stats,
  desc,
}: {
  title: string;
  source: string;
  stats: [string, string][];
  desc: string;
}) {
  return (
    <div className="glass border-gradient rounded-(--radius) p-6">
      <div className="text-[10px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        {source}
      </div>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {stats.map(([v, l]) => (
          <div key={l}>
            <div className="text-2xl font-semibold tabular-nums num-gradient">{v}</div>
            <div className="mt-1 text-[10px] text-(--color-fg-subtle) font-mono uppercase tracking-widest">
              {l}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-(--color-fg-muted) leading-relaxed">{desc}</p>
    </div>
  );
}
