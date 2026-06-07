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

async function tryReadJson<T>(filename: string): Promise<T | null> {
  try {
    const p = path.join(process.cwd(), "public", "data", filename);
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
