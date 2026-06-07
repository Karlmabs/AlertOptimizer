import { PageHeader } from "@/components/page-header";
import { AlertsClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";

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
    </div>
  );
}
