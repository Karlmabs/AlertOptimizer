/**
 * Client helpers for the FastAPI workbench backend.
 * Default base URL is http://127.0.0.1:8000.
 */
const BASE = process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:8000";

export const API = BASE;

export type Metrics = {
  precision: number;
  recall: number;
  f1: number;
  f2?: number;
  reduction: number;
  vp_missed: number;
  tp: number;
  fp_kept: number;
  fn: number;
  tn: number;
};

export type AlertRow = {
  id: number;
  k: number;
  rule_id: string;
  rule_category: string;
  level: string;
  source: string;
  file_path: string;
  start_line: number;
  test_cwe: string;
  y_true: 0 | 1;
  y_prob: number;
  y_pred: 0 | 1;
};

export type AlertsResponse = {
  total: number;
  offset: number;
  limit: number;
  items: AlertRow[];
};

export type AlertSource = {
  alert_id: number;
  absolute_path: string;
  relative_path: string;
  start_line: number;
  rule_id: string;
  level: string;
  is_fp: boolean;
  test_cwe: string;
  test_category: string;
  source: string;
  lines: string[];
};

export type WorkbenchState = {
  seed: number;
  n_rules: number;
  default: {
    eps: number;
    min_pts: number;
    n_estimators: number;
    max_depth: number;
    threshold: number;
    metrics: Metrics;
    roc_auc: number;
  };
  test: {
    n: number;
    y_true: (0 | 1)[];
    y_prob: number[];
    indexes: number[];
  };
  n_train_labeled: number;
  n_pool: number;
  n_clusters_default: number;
};

export type RetrainParams = {
  eps: number;
  min_pts: number;
  n_estimators: number;
  max_depth: number;
};

export type RetrainResponse = {
  params: RetrainParams & { dbscan_max_labeled: number };
  n_clusters: number;
  noise_pct: number;
  best_threshold: number;
  metrics: Metrics;
  roc_auc: number;
  pr_auc: number;
  oob_error: number | null;
  threshold_sweep: {
    threshold: number;
    precision: number;
    recall: number;
    f1: number;
    reduction: number;
  }[];
  y_prob_head: number[];
  y_true_head: (0 | 1)[];
};

export type ALPoolItem = {
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

export type ALStepResponse = {
  n_new_labels: number;
  n_train_after: number;
  n_pool_after: number;
  best_threshold: number;
  metrics: Metrics;
  roc_auc: number;
  next_uncertain: {
    id: number;
    y_prob: number;
    uncertainty: number;
  }[];
};

export async function getAlerts(
  params: {
    offset?: number;
    limit?: number;
    q?: string;
    rule?: string;
    category?: string;
    source?: string;
    fp?: "true" | "false";
    pred?: "tp" | "fp" | "fn" | "tn";
    threshold?: number;
    sort?: "uncertainty" | "id" | "rule" | "proba";
  } = {}
): Promise<AlertsResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const r = await fetch(`${BASE}/api/alerts?${qs}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`alerts failed: ${r.status}`);
  return r.json();
}

export async function getAlertSource(id: number): Promise<AlertSource> {
  const r = await fetch(`${BASE}/api/alert/${id}/source`, { cache: "no-store" });
  if (!r.ok) {
    const msg = await r.text();
    throw new Error(msg);
  }
  return r.json();
}

export async function retrain(p: RetrainParams): Promise<RetrainResponse> {
  const r = await fetch(`${BASE}/api/retrain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p, dbscan_max_labeled: 1500 }),
  });
  if (!r.ok) throw new Error(`retrain failed: ${r.status}`);
  return r.json();
}

export async function activeLearningStep(
  labels: Record<number, 0 | 1>
): Promise<ALStepResponse> {
  const r = await fetch(`${BASE}/api/active-learning/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ labels }),
  });
  if (!r.ok) throw new Error(`AL step failed: ${r.status}`);
  return r.json();
}

export async function checkBackend(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/health`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

export type SSELine = { text: string };

export function streamSSE(
  path: string,
  handlers: {
    onStart?: (data: unknown) => void;
    onLine?: (line: SSELine) => void;
    onDone?: (data: { exit_code: number; script: string }) => void;
    onError?: (msg: string) => void;
  }
) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const es = new EventSource(url);
  es.addEventListener("start", (e) => {
    try {
      handlers.onStart?.(JSON.parse((e as MessageEvent).data));
    } catch (err) {
      console.warn(err);
    }
  });
  es.addEventListener("line", (e) => {
    try {
      handlers.onLine?.(JSON.parse((e as MessageEvent).data));
    } catch (err) {
      console.warn(err);
    }
  });
  es.addEventListener("done", (e) => {
    try {
      handlers.onDone?.(JSON.parse((e as MessageEvent).data));
    } catch (err) {
      console.warn(err);
    }
    es.close();
  });
  es.addEventListener("error", (e) => {
    handlers.onError?.((e as MessageEvent)?.data ?? "stream error");
  });
  return () => es.close();
}

/** Compute metrics from y_prob + y_true at a given threshold (client-side, instant). */
export function metricsAt(
  yProb: number[],
  yTrue: (0 | 1)[],
  threshold: number
): Metrics {
  let tp = 0, fp_kept = 0, fn = 0, tn = 0;
  for (let i = 0; i < yProb.length; i++) {
    const pred = yProb[i] >= threshold ? 1 : 0;
    const truth = yTrue[i];
    if (truth === 0 && pred === 0) tp++;
    else if (truth === 1 && pred === 0) fp_kept++;
    else if (truth === 0 && pred === 1) fn++;
    else tn++;
  }
  const precision = tp / Math.max(tp + fp_kept, 1);
  const recall = tp / Math.max(tp + fn, 1);
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-10);
  const reduction = (tn + fn) / Math.max(yProb.length, 1);
  return {
    precision,
    recall,
    f1,
    reduction,
    vp_missed: fn,
    tp,
    fp_kept,
    fn,
    tn,
  };
}
