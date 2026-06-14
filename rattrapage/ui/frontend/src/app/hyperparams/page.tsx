import { PageHeader } from "@/components/page-header";
import { HyperparamsClient } from "./client";
import { tryReadWorkbenchState } from "@/lib/cache";
import { MissingDataBanner } from "@/components/missing-data-banner";
import { Takeaway } from "@/components/takeaway";

export default async function HyperparamsPage() {
  const state = await tryReadWorkbenchState();
  if (!state) {
    return (
      <MissingDataBanner
        step={6}
        stepSlug="pipeline"
        stepLabel="Pipeline DBSCAN + RF"
        what="les hyperparamètres et résultats de base du pipeline"
      />
    );
  }

  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Atelier hyperparamètres"
        title="Bouge les sliders, clique Train, regarde le modèle apprendre"
        intro={
          <>
            Chaque entraînement prend entre <strong className="text-(--color-fg)">2 et 5 secondes</strong>{" "}
            (66 227 alertes, NumPy pur). Les valeurs <span className="text-(--color-fg)">v6</span> sont
            celles du mémoire. Les sliders te montrent visuellement où tu es par rapport à elles.
          </>
        }
      />
      <HyperparamsClient defaults={state.default} />

      <Takeaway
        tone="positive"
        points={[
          <>
            La grid search (105 entraînements) confirme que les hyperparamètres du mémoire (ε=0,25, MinPts=3, n=50,
            depth=14) sont à <strong className="text-(--color-fg)">0,012 pt F1 de l&apos;optimum</strong> trouvé sur le
            dataset réel — un choix robuste, pas du cherry-picking.
          </>,
          <>
            Au-delà de 50 arbres, le gain est <strong className="text-(--color-fg)">sous le bruit</strong> (théorème de
            convergence de Breiman, 2001) pour un coût de calcul qui double : le compromis du mémoire est correct.
          </>,
          <>
            <strong className="text-(--color-fg)">Conclusion :</strong> les paramètres n&apos;ont pas été ré-optimisés
            sur les données d&apos;évaluation (ce qui serait du sur-apprentissage méthodologique) — et pourtant ils
            tiennent. Tu peux le vérifier en direct : bouge un slider, ré-entraîne en 2-5 s.
          </>,
        ]}
      />
    </div>
  );
}
