import { PageHeader } from "@/components/page-header";
import { ALClient } from "./client";
import { tryReadWorkbenchState, tryReadWorkbenchPool } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";

export default async function ALPage() {
  const state = await tryReadWorkbenchState();
  const pool = await tryReadWorkbenchPool();
  if (!state || !pool) {
    return (
      <MissingDataBanner
        step={6}
        stepSlug="pipeline"
        stepLabel="Pipeline DBSCAN + RF"
        what="le pool des 2 000 alertes les plus incertaines"
      />
    );
  }

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Labo d'apprentissage actif"
        title="Tu joues l'oracle — chaque label fait apprendre le modèle"
        intro="Le pool contient les 2 000 alertes les plus incertaines (probabilité proche de 0.5). Sélectionne quelques-unes, donne ton label, valide. Le RF se ré-entraîne sur le set augmenté (~3 s), et toutes les métriques se mettent à jour."
      />
      <ALClient initialPool={pool} defaults={state.default} />
    </div>
  );
}
