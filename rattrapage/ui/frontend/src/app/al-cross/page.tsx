import { PageHeader } from "@/components/page-header";
import { ALCrossClient } from "./client";
import { tryReadALCrossResults } from "@/lib/cache";

export default async function ALCrossPage() {
  const data = await tryReadALCrossResults();

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Atelier adaptation"
        title="Apprentissage actif cross-dataset — la réponse au non-transfert"
        intro={
          <>
            L&apos;atelier généralisation a montré que le modèle ne transfère pas en zéro-shot d&apos;un benchmark à
            l&apos;autre. Ici on mesure si l&apos;<strong className="text-(--color-fg)">apprentissage actif</strong> permet
            de <em>s&apos;adapter</em> : on entraîne sur un dataset, puis on annote progressivement quelques alertes du
            nouveau dataset et on regarde le F1 remonter. On compare deux stratégies d&apos;annotation —{" "}
            <strong className="text-(--color-fg)">incertitude</strong> (la stratégie du mémoire) vs{" "}
            <strong className="text-(--color-fg)">aléatoire</strong> — vers la borne haute « tout B annoté ».
          </>
        }
      />
      <ALCrossClient initial={data} />
    </div>
  );
}
