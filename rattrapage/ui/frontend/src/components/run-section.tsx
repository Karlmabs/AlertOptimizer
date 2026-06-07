import { RunExperimentButton } from "./run-experiment-button";

type Props = {
  title: string;
  description: string;
  endpoint: string;
  label: string;
};

export function RunSection({ title, description, endpoint, label }: Props) {
  return (
    <div className="glass border-gradient rounded-(--radius) p-6 md:p-7">
      <div className="text-[11px] font-mono uppercase tracking-widest text-(--color-fg-subtle)">
        Exécution live
      </div>
      <div className="mt-1 text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm text-(--color-fg-muted) leading-relaxed max-w-2xl">
        {description}
      </p>
      <div className="mt-5">
        <RunExperimentButton endpoint={endpoint} label={label} />
      </div>
    </div>
  );
}
