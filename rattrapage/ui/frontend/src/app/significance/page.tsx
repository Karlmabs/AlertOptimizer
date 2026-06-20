import { PageHeader } from "@/components/page-header";
import { SignificanceClient } from "./client";
import { tryReadSignificanceResults } from "@/lib/cache";

export default async function SignificancePage() {
  const data = await tryReadSignificanceResults();

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-5xl mx-auto w-full">
      <PageHeader
        eyebrow="Significativité"
        title="Mes +11,2 points, est-ce du solide ou du bruit ?"
        intro={
          <>
            « +11,2 pts F1 », c&apos;est un seul chiffre. Ici je le teste. Deux méthodes classiques, tout en NumPy :
            le <strong className="text-(--color-fg)">test de McNemar</strong> (le pipeline est-il vraiment meilleur,
            alerte par alerte ?) et un <strong className="text-(--color-fg)">intervalle de confiance bootstrap</strong>{" "}
            (je ré-échantillonne le test 2 000 fois et je regarde si l&apos;écart reste positif).
          </>
        }
      />
      <SignificanceClient initial={data} />
    </div>
  );
}
