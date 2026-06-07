import { notFound } from "next/navigation";
import { getStep } from "@/lib/workflow";
import { WorkflowStep } from "@/components/workflow-step";

export default async function StepPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const step = getStep(slug);
  if (!step) notFound();
  // Don't pass the step object directly — the LucideIcon function inside is
  // not serializable to a Client Component. The client re-imports by slug.
  return <WorkflowStep slug={slug} />;
}

export function generateStaticParams() {
  // Statically prerender every step page
  return [
    { slug: "sources" },
    { slug: "labels" },
    { slug: "scan" },
    { slug: "dataset" },
    { slug: "features" },
    { slug: "pipeline" },
    { slug: "baselines" },
    { slug: "active-learning" },
    { slug: "grid-search" },
    { slug: "verdicts" },
  ];
}
