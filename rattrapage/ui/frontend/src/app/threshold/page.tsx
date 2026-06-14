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
        title="Bouge le slider, regarde tout se mettre à jour"
        intro="Toutes les valeurs sont recalculées côté client à partir des 33 115 prédictions du test set — zéro latence. C'est le moment-clé pour montrer au jury le compromis précision/rappel en direct."
      />
      <ThresholdClient state={state} />

      <Takeaway
        tone="positive"
        points={[
          <>
            Au seuil par défaut <strong className="text-(--color-fg)">0,45</strong>, le système coupe{" "}
            <strong className="text-(--color-fg)">68,5 % du volume d&apos;alertes</strong> tout en conservant{" "}
            <strong className="text-(--color-fg)">87,6 % des vraies vulnérabilités</strong>.
          </>,
          <>
            Le seuil est <strong className="text-(--color-fg)">le seul curseur de déploiement</strong> : pour un
            contexte plus prudent, à <strong className="text-(--color-fg)">0,70</strong> le rappel monte à ~96 % (quasi
            aucune vraie vuln manquée) au prix d&apos;une réduction ramenée à ~54 % — sans ré-entraîner le modèle.
          </>,
          <>
            <strong className="text-(--color-fg)">Conclusion :</strong> l&apos;équipe règle le compromis
            précision/rappel selon sa tolérance au risque ; le modèle, lui, ne change pas.
          </>,
        ]}
      />
    </div>
  );
}
