import { PageHeader } from "@/components/page-header";
import { RunsClient } from "./client";
import { Takeaway } from "@/components/takeaway";

export default function RunsPage() {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Exécutions complètes"
        title="Re-jouer les scripts d'expérimentation en direct"
        intro="Chaque bouton lance un script Python du dossier rattrapage/scripts/ et stream son stdout en SSE. Idéal pour montrer au jury que l'expérimentation tourne réellement."
      />
      <RunsClient />

      <Takeaway
        points={[
          <>
            <strong className="text-(--color-fg)">Aucun chiffre n&apos;est figé dans une slide</strong> : les
            résultats du mémoire sortent du code, en direct, à la demande.
          </>,
          <>
            <strong className="text-(--color-fg)">Conclusion :</strong> l&apos;expérimentation est entièrement
            reproductible — c&apos;est la garantie d&apos;intégrité que le jury attend après la première soutenance.
          </>,
        ]}
      />
    </div>
  );
}
