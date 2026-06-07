import { PageHeader } from "@/components/page-header";
import { ThresholdClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";

export default async function ThresholdPage() {
  const state = await tryReadWorkbenchState();
  if (!state) {
    return (
      <MissingDataBanner
        step={6}
        stepSlug="pipeline"
        stepLabel="Pipeline DBSCAN + RF"
        what="les prédictions du modèle sur les 33 115 alertes de test"
      />
    );
  }

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Tuner de seuil"
        title="Bouge le slider, regarde tout se mettre à jour"
        intro="Toutes les valeurs sont recalculées côté client à partir des 33 115 prédictions du test set — zéro latence. C'est le moment-clé pour montrer au jury le compromis précision/rappel en direct."
      />
      <ThresholdClient state={state} />
    </div>
  );
}
