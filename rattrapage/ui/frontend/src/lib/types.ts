/**
 * Types for the full_experiment_results.json produced by
 * rattrapage/scripts/full_experiment_real.py
 */

export type Metrics = {
  precision: number;
  recall: number;
  f1: number;
  f2: number;
  reduction: number;
  vp_missed: number;
  tp: number;
  fp_kept: number;
  fn: number;
  tn: number;
};

export type Exp1Main = {
  seed: number;
  n_train_labeled: number;
  n_dbscan_labeled: number;
  n_test: number;
  n_clusters: number;
  noise_pct: number;
  best_threshold: number;
  metrics: Metrics;
  roc_auc: number;
  pr_auc: number;
  oob_error: number;
  timings: { dbscan_s: number; rf_train_s: number };
};

export type FeatureImportance = {
  feature: string;
  f1_drop: number;
  roc_drop: number;
  f1_imp: number;
  roc_imp: number;
};

export type ALCycle = {
  cycle: number;
  fb: number;
  f1: number;
  prec: number;
  rec: number;
  red: number;
  pool_size: number;
  threshold: number;
};

export type FPSensitivity = {
  target_fp_rate: number;
  actual_fp_rate: number;
  n_test: number;
  n_clusters: number;
  best_threshold: number;
  roc_auc: number;
} & Metrics;

export type SeedRow = {
  seed: number;
  f1: number;
  prec: number;
  rec: number;
  red: number;
  roc: number;
  pr: number;
  n_clusters: number;
  dbscan_s: number;
  rf_train_s: number;
};

export type ThresholdSweep = {
  threshold: number;
} & Metrics;

export type ROCPoint = {
  threshold: number;
  tpr: number;
  fpr: number;
};

export type PRPoint = {
  threshold: number;
  precision: number;
  recall: number;
};

export type BaselineEntry = {
  metrics: Metrics;
  threshold: number;
  roc_auc?: number;
  pr_auc?: number;
};

export type Hypotheses = {
  H1: boolean;
  H2: boolean;
  H3_perfect: boolean;
  H3_noisy: boolean;
  deltas: {
    H2_delta_f1: number;
    H3_perfect_delta_f1: number;
    H3_noisy_delta_f1: number;
  };
};

export type FullResults = {
  exp1_main: Exp1Main;
  exp2_feature_importance: {
    base_f1: number;
    base_roc: number;
    importances: FeatureImportance[];
  };
  exp3_active_learning_perfect: ALCycle[];
  exp4_active_learning_noisy: ALCycle[];
  exp5_fp_sensitivity: FPSensitivity[];
  exp6_multi_seed: SeedRow[];
  exp7_threshold_sweep: ThresholdSweep[];
  exp8_roc_pr: { roc: ROCPoint[]; pr: PRPoint[] };
  baselines: {
    b0_random: BaselineEntry;
    b1_majority: BaselineEntry;
    b2_rf_no_dbscan: BaselineEntry;
    b4_groupby_rule: BaselineEntry;
  };
  hypotheses: Hypotheses;
};

/* ────────────────────────────────────────────────────────
   Static numbers from the mémoire (synthetic dataset) —
   used to show before/after comparison in the UI
   ──────────────────────────────────────────────────────── */
export const SYNTHETIC_BASELINE = {
  dataset: {
    n_alerts: 5000,
    n_rules: 32,
    fp_rate: 0.514,
    sources: ["synthetic"],
  },
  exp1: {
    f1: 0.801,
    precision: 0.749,
    recall: 0.861,
    reduction: 0.44,
    roc_auc: 0.868,
    pr_auc: 0.852,
    oob_error: 0.109,
  },
  feature_importance: {
    "rule.id": 0.817,
    cluster_fp_rate: 0.067,
    level: 0.045,
    file_type: 0.031,
    severity: 0.018,
    rank: 0.012,
    cluster_size: 0.005,
    "tool.name": 0.003,
    start_line: 0.001,
    occurrenceCount: 0.001,
  } as Record<string, number>,
  multi_seed_sigma: 0.019,
  hypotheses: {
    H1: "partial", // recall 86% OK, reduction 44% < 50%
    H2: "infirmed", // -1.6 pts
    H3_perfect: "validated", // +3.1%
    H3_noisy: "not_validated", // +2.7%
    deltas: {
      H2_delta_f1: -0.016,
      H3_perfect_delta_f1: 0.031,
      H3_noisy_delta_f1: 0.027,
    },
  },
} as const;
