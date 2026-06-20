"use client";

import { PipelineFlow } from "./pipeline-flow";
import { DbscanViz } from "./dbscan-viz";
import { RandomForestViz } from "./random-forest-viz";
import { ActiveLearningLoop } from "./active-learning-loop";

/**
 * Renders the mechanism animation relevant to a wizard step, so each page
 * shows *what happens* — not only the resulting numbers. Returns null for
 * steps that have no dedicated visual.
 */
export function StepVisual({ slug }: { slug: string }) {
  if (slug === "pipeline") {
    return (
      <div className="space-y-6">
        <PipelineFlow />
        <div className="grid lg:grid-cols-2 gap-6">
          <DbscanViz />
          <RandomForestViz />
        </div>
      </div>
    );
  }
  if (slug === "active-learning") {
    return <ActiveLearningLoop />;
  }
  return null;
}
