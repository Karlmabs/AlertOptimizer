import { PageHeader } from "@/components/page-header";
import { ThresholdClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";
import { Takeaway } from "@/components/takeaway";

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
        title="Bouge le seuil, tout se met à jour"
        intro="Tout est recalculé dans le navigateur à partir des 33 115 prédictions du test, sans latence. C'est le bon endroit pour montrer le compromis précision/rappel en direct."
      />
      <ThresholdClient state={state} />

      <Takeaway
        tone="positive"
        points={[
          <>
            À <strong className="text-(--color-fg)">0,45</strong> : je filtre{" "}
            <strong className="text-(--color-fg)">68 % des alertes</strong> et je garde{" "}
            <strong className="text-(--color-fg)">88 % des vraies failles</strong>.
          </>,
          <>
            Besoin d&apos;être plus prudent ? À <strong className="text-(--color-fg)">0,70</strong> je garde 96 % des
            failles, mais je ne filtre plus que 54 %. Pas besoin de ré-entraîner : c&apos;est juste le curseur.
          </>,
          <>
            Le seuil s&apos;ajuste au risque qu&apos;on accepte. Le modèle, lui, ne bouge pas.
          </>,
        ]}
      />
    </div>
  );
}
