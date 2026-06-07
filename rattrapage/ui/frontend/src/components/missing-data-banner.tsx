import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

type Props = {
  step: number;
  stepSlug: string;
  stepLabel: string;
  what: string;
};

/**
 * Friendly placeholder shown when an atelier page is opened but the wizard
 * step that produces its cached data hasn't been run yet.
 */
export function MissingDataBanner({ step, stepSlug, stepLabel, what }: Props) {
  return (
    <div className="px-6 md:px-12 lg:px-16 py-12 max-w-4xl mx-auto w-full">
      <div className="glass border-gradient rounded-(--radius) p-8 md:p-10 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-(--color-warn)/15 border border-(--color-warn)/40">
          <AlertTriangle className="w-5 h-5 text-(--color-warn)" />
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Cet atelier a besoin de données qui n&apos;ont pas encore été générées
        </h2>
        <p className="text-sm md:text-base text-(--color-fg-muted) max-w-2xl mx-auto leading-relaxed">
          Cette page consomme <span className="text-(--color-fg) font-medium">{what}</span>.
          Lance d&apos;abord l&apos;étape {step} du wizard pour produire ces artefacts, puis
          reviens ici.
        </p>
        <Link
          href={`/step/${stepSlug}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-(--color-fg) text-(--color-bg) font-medium text-sm hover:bg-(--color-accent) transition-colors"
        >
          Aller à l&apos;étape {step} : {stepLabel}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
