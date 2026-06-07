import { PageHeader } from "@/components/page-header";
import { RunsClient } from "./client";

export default function RunsPage() {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Exécutions complètes"
        title="Re-jouer les scripts d'expérimentation en direct"
        intro="Chaque bouton lance un script Python du dossier rattrapage/scripts/ et stream son stdout en SSE. Idéal pour montrer au jury que l'expérimentation tourne réellement."
      />
      <RunsClient />
    </div>
  );
}
