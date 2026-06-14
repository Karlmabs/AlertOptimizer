import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";

/**
 * "Ce qu'il faut retenir" — a consistent conclusion block placed at the bottom
 * of every atelier so the jury always gets an explicit takeaway, not just raw
 * numbers. `tone` tints the accent: positive (green), caution (amber), neutral.
 */
export function Takeaway({
  title = "Ce qu'il faut retenir",
  tone = "neutral",
  points,
  children,
}: {
  title?: string;
  tone?: "positive" | "caution" | "neutral";
  points?: ReactNode[];
  children?: ReactNode;
}) {
  const color =
    tone === "positive"
      ? "var(--color-accent)"
      : tone === "caution"
        ? "#d9a441"
        : "var(--color-info)";
  return (
    <section
      className="glass rounded-(--radius) p-5 md:p-6 mt-6 border-l-2"
      style={{ borderLeftColor: color }}
    >
      <div
        className="inline-flex items-center gap-2 text-sm font-semibold mb-3"
        style={{ color }}
      >
        <Lightbulb className="w-4 h-4" />
        {title}
      </div>
      {points ? (
        <ul className="space-y-2">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-(--color-fg-muted) leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-(--color-fg-muted) leading-relaxed">{children}</div>
      )}
    </section>
  );
}
