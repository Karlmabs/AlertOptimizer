import { PageHeader } from "@/components/page-header";
import { RunsClient } from "./client";
import { Takeaway } from "@/components/takeaway";

export default function RunsPage() {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Exécutions complètes"
        title="Re-jouer mes scripts en direct"
        intro="Chaque bouton lance un script Python de rattrapage/scripts/ et affiche sa sortie en temps réel. Je peux montrer que l'expérimentation tourne vraiment, là, devant vous."
      />
      <RunsClient />

      <Takeaway
        points={[
          <>
            <strong className="text-(--color-fg)">Aucun chiffre n&apos;est figé dans une slide</strong> : tout sort du
            code, à la demande.
          </>,
          <>C&apos;est ma garantie d&apos;intégrité après la première soutenance : tout est reproductible.</>,
        ]}
      />
    </div>
  );
}
