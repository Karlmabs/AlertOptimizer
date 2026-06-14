import { PageHeader } from "@/components/page-header";
import { GeneralizationClient } from "./client";
import { tryReadLodoResults } from "@/lib/cache";

export default async function GeneralizationPage() {
  const data = await tryReadLodoResults();

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Atelier généralisation"
        title="Le système tient-il hors de son dataset d'entraînement ?"
        intro={
          <>
            Deux tests qui répondent au jury.
            <br />
            <strong className="text-(--color-fg)">1 · LODO</strong> : j&apos;entraîne sur un dataset, je teste sur
            l&apos;<em>autre</em>. L&apos;écart entre « même dataset » et « dataset croisé », c&apos;est ma vraie
            capacité à généraliser.
            <br />
            <strong className="text-(--color-fg)">2 · Ablation sans <code>rule.id</code></strong> : je coupe
            complètement la feature <code>rule.id</code>. Si le F1 tient, ce n&apos;est pas une table de
            correspondance. Réponse directe à la critique #2.
          </>
        }
      />
      <GeneralizationClient initial={data} />
    </div>
  );
}
