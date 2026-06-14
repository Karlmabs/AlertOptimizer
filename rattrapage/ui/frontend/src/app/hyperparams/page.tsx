import { PageHeader } from "@/components/page-header";
import { HyperparamsClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";
import { Takeaway } from "@/components/takeaway";

export default async function HyperparamsPage() {
  const state = await tryReadWorkbenchState();
  if (!state) {
    return (
      <MissingDataBanner
        step={6}
        stepSlug="pipeline"
        stepLabel="Pipeline DBSCAN + RF"
        what="les hyperparamètres et résultats de base du pipeline"
      />
    );
  }

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Atelier hyperparamètres"
        title="Bouge les sliders, clique Train, regarde le modèle apprendre"
        intro={
          <>
            Chaque entraînement prend <strong className="text-(--color-fg)">2 à 5 secondes</strong> (66 227 alertes,
            NumPy pur). Les valeurs <span className="text-(--color-fg)">v6</span>, ce sont celles de mon mémoire.
            Bougez les sliders pour voir l&apos;écart.
          </>
        }
      />
      <HyperparamsClient defaults={state.default} />

      <Takeaway
        tone="positive"
        points={[
          <>
            La grid search (105 entraînements) le confirme : mes réglages sont à{" "}
            <strong className="text-(--color-fg)">0,01 pt F1 de l&apos;optimum</strong>. Pas du hasard, pas du
            cherry-picking.
          </>,
          <>
            Au-delà de 50 arbres, je ne gagne quasi rien (Breiman, 2001), mais le calcul double. Je garde 50.
          </>,
          <>
            Je n&apos;ai pas ré-optimisé sur les données de test. Et pourtant ça tient — bougez un slider, vous verrez.
          </>,
        ]}
      />
    </div>
  );
}
