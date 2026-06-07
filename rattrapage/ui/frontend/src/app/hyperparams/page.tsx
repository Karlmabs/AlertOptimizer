import { PageHeader } from "@/components/page-header";
import { HyperparamsClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";

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
            Chaque entraînement prend entre <strong className="text-(--color-fg)">2 et 5 secondes</strong>{" "}
            (66 227 alertes, NumPy pur). Les valeurs <span className="text-(--color-fg)">v6</span> sont
            celles du mémoire. Les sliders te montrent visuellement où tu es par rapport à elles.
          </>
        }
      />
      <HyperparamsClient defaults={state.default} />
    </div>
  );
}
