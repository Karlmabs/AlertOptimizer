import { PageHeader } from "@/components/page-header";
import { ALCrossClient } from "./client";
import { tryReadALCrossResults } from "@/lib/cache";

export default async function ALCrossPage() {
  const data = await tryReadALCrossResults();

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Atelier adaptation"
        title="Apprentissage actif cross-dataset"
        intro={
          <>
            L&apos;atelier précédent montre que mon modèle ne transfère pas en zéro-shot d&apos;un dataset à
            l&apos;autre. Ici je teste si l&apos;<strong className="text-(--color-fg)">apprentissage actif</strong>{" "}
            rattrape le coup : j&apos;entraîne sur un dataset, puis j&apos;annote petit à petit quelques alertes du
            nouveau, et je regarde le F1 remonter. Je compare deux façons de choisir quoi annoter —{" "}
            <strong className="text-(--color-fg)">par incertitude</strong> (ma stratégie du mémoire) vs{" "}
            <strong className="text-(--color-fg)">au hasard</strong> — vers la borne haute « tout annoté ».
          </>
        }
      />
      <ALCrossClient initial={data} />
    </div>
  );
}
