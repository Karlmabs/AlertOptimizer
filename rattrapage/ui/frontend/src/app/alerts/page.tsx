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
        intro="Filtrez par règle, catégorie, source ou type de prédiction (TP/FP/FN/TN). À droite, le code Java surligné à la ligne signalée, avec la vérité OWASP/NIST et ma prédiction."
      />
      <AlertsClient />

      <Takeaway
        points={[
          <>
            Chaque prédiction remonte jusqu&apos;au <strong className="text-(--color-fg)">code Java</strong> et au label
            OWASP/NIST. Pas de boîte noire : on peut auditer n&apos;importe quelle décision.
          </>,
          <>
            Les <strong className="text-(--color-fg)">faux négatifs</strong> (vraies failles que je filtre à tort)
            s&apos;inspectent un par un. C&apos;est là qu&apos;est le vrai risque.
          </>,
          <>Je ne demande pas qu&apos;on me croie sur parole : tout est sur la table.</>,
        ]}
      />
    </div>
  );
}
