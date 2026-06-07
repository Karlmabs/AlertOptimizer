import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { FullResults } from "./types";

let cached: FullResults | null = null;

/** Server-side data loader. Reads full_experiment_results.json once per process. */
export async function getResults(): Promise<FullResults> {
  if (cached) return cached;
  const p = path.join(process.cwd(), "public", "data", "full_experiment_results.json");
  const raw = await fs.readFile(p, "utf8");
  cached = JSON.parse(raw) as FullResults;
  return cached;
}

/** Read grid-search CSVs (DBSCAN, RF). */
export async function getDbscanGrid(): Promise<
  { eps: number; min_pts: number; f1: number; reduction: number; recall: number; n_clusters: number; noise_pct: number; roc_auc: number }[]
> {
  const p = path.join(process.cwd(), "public", "data", "hyperparam_dbscan.csv");
  return parseCsv(await fs.readFile(p, "utf8"));
}

export async function getRfGrid(): Promise<
  { n_estimators: number; max_depth: number; f1: number; reduction: number; recall: number; train_s: number; oob_error: number; roc_auc: number }[]
> {
  const p = path.join(process.cwd(), "public", "data", "hyperparam_rf.csv");
  return parseCsv(await fs.readFile(p, "utf8"));
}

// Tiny CSV parser (no quoted strings expected in our files)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCsv(raw: string): any[] {
  const lines = raw.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj: Record<string, unknown> = {};
    header.forEach((h, i) => {
      const v = cols[i];
      const num = Number(v);
      obj[h] = Number.isFinite(num) && v !== "" ? num : v;
    });
    return obj;
  });
}
