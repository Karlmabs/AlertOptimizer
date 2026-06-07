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
            Deux épreuves qui répondent <strong className="text-(--color-fg)">frontalement</strong> au jury.
            <br />
            <strong className="text-(--color-fg)">1 · LODO</strong> (Leave-One-Dataset-Out) — on entraîne sur un
            dataset et on teste sur l&apos;<em>autre</em>. L&apos;écart entre l&apos;évaluation classique (même
            dataset) et l&apos;évaluation croisée mesure la vraie capacité de généralisation.
            <br />
            <strong className="text-(--color-fg)">2 · Ablation sans <code>rule.id</code></strong> — on neutralise
            complètement la feature <code>rule.id</code>. Si le F1 tient, le modèle n&apos;est pas une simple table
            de correspondance — réponse directe à la critique #2.
          </>
        }
      />
      <GeneralizationClient initial={data} />
    </div>
  );
}
