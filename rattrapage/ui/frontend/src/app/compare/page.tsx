import { PageHeader } from "@/components/page-header";

export default function ComparePage() {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-8 md:py-12 max-w-7xl mx-auto w-full">
      <PageHeader
        eyebrow="Comparaison de scénarios"
        title="Sauvegarde et compare plusieurs configurations"
        intro="Cet atelier permet de mémoriser des configurations (v6, custom-1, custom-2…) et de les afficher côte à côte. À venir — pour l'instant, utilise l'atelier hyperparamètres et note les chiffres manuellement."
      />
      <div className="glass border-gradient rounded-(--radius) p-7 text-sm text-(--color-fg-muted)">
        Module en développement. Si tu en as besoin pour la soutenance, signale-le.
      </div>
    </div>
  );
}
