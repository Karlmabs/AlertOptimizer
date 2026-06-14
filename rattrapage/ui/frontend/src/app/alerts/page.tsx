import { PageHeader } from "@/components/page-header";
import { AlertsClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";
import { Takeaway } from "@/components/takeaway";

export default async function AlertsPage() {
  const state = await tryReadWorkbenchState();
  if (!state) {
    return (
      <MissingDataBanner
        step={7}
        stepSlug="pipeline"
        stepLabel="Pipeline DBSCAN + RF"
        what="les prédictions et la liste des 33 115 alertes du test set"
      />
    );
  }
  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-[1500px] mx-auto w-full">
      <PageHeader
        eyebrow="Explorateur d'alertes"
        title={`${state.test.n.toLocaleString("fr-FR")} alertes du test set · clique pour voir le code Java`}
        intro="Filtre par règle, catégorie, source, ou par type de prédiction (TP/FP/FN/TN). Le panneau de droite affiche le code Java surligné à la ligne signalée par Semgrep, avec la vérité OWASP/NIST et la prédiction du modèle."
      />
      <AlertsClient />

      <Takeaway
        points={[
          <>
            Chaque prédiction est <strong className="text-(--color-fg)">traçable jusqu&apos;au code Java</strong> et à
            la vérité OWASP/NIST — aucune boîte noire, le jury peut auditer n&apos;importe quelle décision.
          </>,
          <>
            Les <strong className="text-(--color-fg)">faux négatifs (FN)</strong> — vraies vulnérabilités filtrées à
            tort — sont inspectables une par une : c&apos;est là que se mesure le vrai risque sécurité du filtrage.
          </>,
          <>
            <strong className="text-(--color-fg)">Conclusion :</strong> le système ne demande pas une confiance
            aveugle ; il expose chaque alerte, son score et son code, ce qui le rend défendable en production.
          </>,
        ]}
      />
    </div>
  );
}
