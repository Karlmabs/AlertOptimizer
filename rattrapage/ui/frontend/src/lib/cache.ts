import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { WorkbenchState } from "./api";

/**
 * Try to read a cached workbench JSON. Returns null if the file doesn't exist
 * yet (i.e. the user hasn't completed step 6 of the wizard).
 *
 * This makes the home page and the interactive ateliers degrade gracefully
 * after a `Reset progression` instead of throwing during render.
 */
export async function tryReadWorkbenchState(): Promise<WorkbenchState | null> {
  return tryReadJson<WorkbenchState>("workbench_state.json");
}

export type PoolItem = {
  id: number;
  rule_id: string;
  rule_category: string;
  source: string;
  file_path: string;
  start_line: number;
  y_true: 0 | 1;
  y_prob: number;
  uncertainty: number;
};

export async function tryReadWorkbenchPool(): Promise<PoolItem[] | null> {
  return tryReadJson<PoolItem[]>("workbench_pool.json");
}

export type LodoCell = {
  f1: number;
  f1_std: number;
  roc_auc: number;
  precision: number;
  recall: number;
  reduction: number;
  n_train: number;
  n_test: number;
  n_clusters: number;
  kind: "in-distribution" | "cross-dataset";
};

export type LodoResults = {
  config: {
    seeds: number[];
    sources: string[];
    note_source_off: string;
    note_threshold: string;
  };
  lodo_matrix: Record<string, LodoCell>;
  lodo_summary: {
    in_distribution_f1: number;
    cross_dataset_f1: number;
    in_distribution_roc: number;
    cross_dataset_roc: number;
    gap_f1: number;
    generalizes: boolean;
  };
  ablation: {
    pooled_with_rule: { f1: number; roc_auc: number };
    pooled_without_rule: { f1: number; roc_auc: number };
    pooled_delta_f1: number;
    per_cell: Record<
      string,
      { with_rule: number; without_rule: number; delta_f1: number; roc_without: number; kind: string }
    >;
    not_a_lookup_table: boolean;
  };
};

export async function tryReadLodoResults(): Promise<LodoResults | null> {
  return tryReadJson<LodoResults>("lodo_ablation_results.json");
}

export type ALCurvePoint = { cycle: number; n_labels: number; f1: number; f1_std: number; roc_auc: number };

export type ALCrossDirection = {
  zero_shot: { f1: number; roc_auc: number };
  upper_bound: { f1: number; roc_auc: number };
  uncertainty: ALCurvePoint[];
  random: ALCurvePoint[];
  gap: number;
  recovered_uncertainty: number;
  recovered_random: number;
  final_uncertainty_f1: number;
  final_random_f1: number;
  random_beats_uncertainty: boolean;
};

export type ALCrossResults = {
  config: {
    seeds: number[];
    cycles: number;
    feedback_per_cycle: number;
    pool_ratio: number;
    source_cap: number;
    sources: string[];
    note: string;
  };
  directions: Record<string, ALCrossDirection>;
};

export async function tryReadALCrossResults(): Promise<ALCrossResults | null> {
  return tryReadJson<ALCrossResults>("al_cross_dataset_results.json");
}

export type SignificanceResults = {
  config: { seed: number; n_test: number; n_bootstrap: number; threshold_pipeline: number; threshold_groupby: number };
  f1_pipeline: number;
  f1_groupby: number;
  gap: number;
  gap_pts: number;
  ci_pipeline: [number, number];
  ci_groupby: [number, number];
  ci_gap: [number, number];
  mcnemar: { b: number; c: number; chi2: number; p_value: number };
  significant: boolean;
};

export async function tryReadSignificanceResults(): Promise<SignificanceResults | null> {
  return tryReadJson<SignificanceResults>("significance_results.json");
}

async function tryReadJson<T>(filename: string): Promise<T | null> {
  try {
    const p = path.join(process.cwd(), "public", "data", filename);
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
