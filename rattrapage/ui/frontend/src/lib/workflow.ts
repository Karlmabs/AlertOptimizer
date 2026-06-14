import type { LucideIcon } from "lucide-react";
import {
  Download,
  Tags,
  Search,
  Database,
  Layers,
  Settings2,
  GitBranch,
  BarChart3,
  Beaker,
  Award,
} from "lucide-react";

export type StepParam = {
  key: string;
  label: string;
  type: "number" | "text" | "boolean" | "select";
  default: number | string | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
};

export type WorkflowStep = {
  number: number;
  slug: string;
  title: string;
  short: string;
  icon: LucideIcon;
  /** Short one-liner shown in the sidebar timeline. */
  tagline: string;
  /** Detailed brief shown on the step page. What the step will do, in plain French. */
  brief: string;
  /** Plain-French interpretation shown after the results — "what these numbers mean". */
  conclusion?: string;
  /** Optional warning (e.g. "Long step, ~10 min"). */
  warning?: string;
  /** Estimated duration when running fresh. */
  duration: string;
  /** Backend SSE endpoint that runs this step. */
  endpoint: string | null;
  /** Editable parameters (passed as query string to the endpoint). */
  parameters?: StepParam[];
  /** Narrative lines shown during execution alongside the streamed log. */
  narration: string[];
  /** Cached result file path under /public/data — if present, skip the run. */
  cachedResult?: string;
  /** "Tools" linked from the result section (e.g. /threshold for the Pipeline step). */
  deepDives?: { href: string; label: string; description: string }[];
  /** Parameter-summary fields to highlight in the Result block. */
  outputParams: {
    label: string;
    /** path in the result JSON (dot notation) */
    path: string;
    format?: "int" | "float" | "pct" | "string";
    digits?: number;
  }[];
  /**
   * If set, when entering this step, default parameter values are read from
   * the result of the named previous step (best practice : run grid search
   * first → use best params for the pipeline). The mapping is paramKey →
   * resultPath. If the previous step hasn't run, defaults from `parameters`
   * are used.
   */
  inheritDefaultsFrom?: {
    stepSlug: string;
    mapping: Record<string, string>;
  };
};

export const WORKFLOW: WorkflowStep[] = [
  {
    number: 1,
    slug: "sources",
    title: "Récupération des sources",
    short: "Sources",
    icon: Download,
    tagline: "Cloner OWASP Benchmark · Télécharger Juliet (NIST)",
    brief:
      "Je télécharge les deux datasets publics qui me servent de vérité-terrain. OWASP Benchmark Java v1.2 (2 740 fichiers labellisés par la Fondation OWASP) est cloné depuis GitHub. Juliet v1.3 (~46 800 fichiers labellisés par le NIST, une CWE par faille) vient du SARD.",
    conclusion:
      "Les deux corpus sont en place. L'important : ces labels viennent d'OWASP et du NIST, pas de moi. C'est déjà la réponse à la critique du dataset fait maison.",
    warning: "Première exécution lourde : ~3 min de téléchargement + décompression. Utilise le cache si déjà présent.",
    duration: "~3 min (fresh) · instantané (cache)",
    endpoint: "/api/workflow/sources",
    narration: [
      "Vérification de la présence de rattrapage/data/BenchmarkJava…",
      "Vérification de la présence de rattrapage/data/juliet…",
      "Si absents : git clone --depth 1 puis curl/unzip…",
      "Extraction du manifest et de l'arborescence Java…",
    ],
    outputParams: [
      { label: "Fichiers Java OWASP", path: "owasp_files", format: "int" },
      { label: "Fichiers Java Juliet", path: "juliet_files", format: "int" },
      { label: "Manifest Juliet", path: "juliet_manifest", format: "string" },
    ],
  },
  {
    number: 2,
    slug: "labels",
    title: "Extraction des labels",
    short: "Labels",
    icon: Tags,
    tagline: "Parser expectedresults-1.2.csv + manifest.xml",
    brief:
      "Je convertis les deux tables de vérité (OWASP et NIST) en un format commun. Pour OWASP je lis expectedresults-1.2.csv ; pour Juliet je parse manifest.xml avec un parseur tolérant (il a des entrées cassées). Pour chaque fichier je retiens sa CWE, ses lignes de faille et sa catégorie.",
    conclusion:
      "J'ai maintenant une vérité-terrain par fichier, signée OWASP/NIST. C'est elle qui me permet, à l'étape 4, de marquer chaque alerte TP ou FP sans rien décider moi-même.",
    duration: "< 2 s",
    endpoint: "/api/workflow/labels",
    narration: [
      "Lecture de OWASP Benchmark Java/expectedresults-1.2.csv…",
      "Lecture de Juliet Java/manifest.xml (regex-based pour tolérer les erreurs)…",
      "Indexation par basename + extraction des CWE et lignes de vulnérabilité…",
    ],
    outputParams: [
      { label: "Labels OWASP", path: "n_owasp_labels", format: "int" },
      { label: "Tests Juliet", path: "n_juliet_tests", format: "int" },
      { label: "Tests Juliet vulnérables", path: "n_juliet_with_flaws", format: "int" },
      { label: "Lignes de flaw indexées", path: "total_flaw_lines", format: "int" },
    ],
  },
  {
    number: 3,
    slug: "scan",
    title: "Scan SAST (Semgrep)",
    short: "Scan",
    icon: Search,
    tagline: "6 rulesets Semgrep sur OWASP + Juliet",
    brief:
      "Je lance Semgrep OSS 1.162 (Docker) avec 6 rulesets publics. Ça produit deux fichiers SARIF. À ce stade les alertes ne sont pas triées : Semgrep ne sait pas lesquelles sont des faux positifs, c'est l'étape 4 qui tranche.",
    conclusion:
      "Semgrep crache des milliers d'alertes, vraies failles et faux positifs mélangés — le quotidien d'un dev. Tout le reste du pipeline sert à faire le tri.",
    warning: "Étape la plus lourde : ~10 min sur Juliet (47k fichiers × 200 règles). Cache fortement recommandé.",
    duration: "~10 min (fresh) · instantané (cache)",
    endpoint: "/api/workflow/scan",
    parameters: [
      {
        key: "rulesets",
        label: "Rulesets Semgrep",
        type: "select",
        default: "all",
        options: [
          { value: "minimal", label: "Minimal (p/java seulement)" },
          { value: "default", label: "Par défaut (3 rulesets)" },
          { value: "all", label: "Tous (6 rulesets, recommandé)" },
        ],
      },
    ],
    narration: [
      "Démarrage du conteneur Docker returntocorp/semgrep:latest…",
      "Scan OWASP Benchmark (2 740 fichiers)…",
      "Scan Juliet (47 420 fichiers)…",
      "Production des SARIF (~75 MB total)…",
    ],
    outputParams: [
      { label: "Alertes OWASP", path: "alerts_owasp", format: "int" },
      { label: "Alertes Juliet", path: "alerts_juliet", format: "int" },
      { label: "Règles activables", path: "rules_total", format: "int" },
      { label: "Règles déclenchées", path: "rules_fired", format: "int" },
    ],
  },
  {
    number: 4,
    slug: "dataset",
    title: "Labellisation et merge",
    short: "Dataset",
    icon: Database,
    tagline: "Jointure SARIF + labels → real_dataset_v2.csv",
    brief:
      "Pour chaque alerte, je regarde son fichier et je consulte la vérité OWASP/NIST. TP (y=0) si le fichier est vulnérable et que la CWE de la règle colle ; sinon FP (y=1). Je fusionne les deux datasets en real_dataset_v2.csv.",
    conclusion:
      "Mon dataset réel est prêt : 66 227 alertes, 68 % de faux positifs (un taux normal dans la littérature). C'est 13× plus gros que mon synthétique, et les labels viennent de tiers.",
    duration: "< 5 s",
    endpoint: "/api/workflow/dataset",
    narration: [
      "Parsing des SARIF (~75 MB JSON)…",
      "Normalisation des CWE (089 → 89)…",
      "Jointure alerte ↔ test source via basename…",
      "Application de la logique CWE matching + catégorie fallback…",
      "Merge OWASP + Juliet → real_dataset_v2.csv…",
    ],
    outputParams: [
      { label: "Alertes totales", path: "n_alerts", format: "int" },
      { label: "TP (vraies vulns)", path: "n_tp", format: "int" },
      { label: "FP (à filtrer)", path: "n_fp", format: "int" },
      { label: "Taux FP", path: "fp_rate", format: "pct" },
      { label: "Règles uniques", path: "n_rules", format: "int" },
    ],
    // Note: deep-dive vers /alerts retiré ici — il apparaît à l'étape 7
    // (Pipeline) où il devient effectivement utilisable.
  },
  {
    number: 5,
    slug: "features",
    title: "Extraction des features",
    short: "Features",
    icon: Layers,
    tagline: "11 features par alerte (8 SARIF + 1 ctx + 2 DBSCAN)",
    brief:
      "Pour chaque alerte j'extrais 8 features SARIF (rule.id normalisé, level, source, tool, start_line, rank, occurrenceCount, severity), 1 feature de contexte (is_taint_rule), et 2 que DBSCAN calculera à l'étape Pipeline (cluster_fp_rate, cluster_size). Au total : une matrice n × 11.",
    conclusion:
      "Chaque alerte devient 11 chiffres, tous tirés des métadonnées SARIF : je ne lis jamais le code source. C'est léger et auditable, et le modèle doit se débrouiller avec ce seul signal.",
    duration: "< 2 s",
    endpoint: "/api/workflow/features",
    narration: [
      "Normalisation des features catégorielles (rule_id sur [0,1])…",
      "Calcul de occurrenceCount par fichier…",
      "Détection des règles taint-tracking (is_taint_rule)…",
      "Construction de la matrice de features…",
    ],
    outputParams: [
      { label: "Features SARIF directes", path: "n_sarif_features", format: "int" },
      { label: "Features contextuelles", path: "n_context_features", format: "int" },
      { label: "Features dérivées DBSCAN", path: "n_dbscan_features", format: "int" },
      { label: "Total features par alerte", path: "n_total_features", format: "int" },
    ],
  },
  {
    number: 6,
    slug: "grid-search",
    title: "Recherche des hyperparamètres",
    short: "Grid Search",
    icon: Settings2,
    tagline: "42 combos DBSCAN × 63 combos RF — 105 entraînements",
    brief:
      "Avant d'entraîner le modèle final, je cherche les meilleurs hyperparamètres. Deux grilles : DBSCAN (7 ε × 6 MinPts = 42) et Random Forest (7 n_estimators × 9 max_depth = 63). 105 entraînements en parallèle, ~60 s. Le meilleur réglage sert par défaut à l'étape suivante.",
    conclusion:
      "La grid search le confirme : mes hyperparamètres sont à 0,01 pt F1 de l'optimum. Je ne les ai pas choisis au hasard, et je ne les ai pas non plus sur-ajustés sur le test.",
    warning: "~60 s — c'est l'étape de calcul la plus longue après le scan SAST.",
    duration: "~60 s",
    endpoint: "/api/workflow/grid-search",
    narration: [
      "Lancement des 42 entraînements DBSCAN en parallèle (8 workers)…",
      "Lancement des 63 entraînements RF en parallèle…",
      "Comparaison de chaque config au F1 du mémoire v6 (ε=0,25 ; n=50 ; d=14)…",
      "Sélection de la meilleure configuration globale…",
    ],
    outputParams: [
      { label: "Meilleur F1 trouvé", path: "best_f1", format: "float", digits: 3 },
      { label: "F1 mémoire v6", path: "v6_f1", format: "float", digits: 3 },
      { label: "Δ optimal vs v6", path: "delta", format: "float", digits: 3 },
      { label: "Configurations testées", path: "total_combos", format: "int" },
      { label: "ε optimal", path: "best_eps", format: "float", digits: 2 },
      { label: "n_estimators optimal", path: "best_n_estimators", format: "int" },
    ],
  },
  {
    number: 7,
    slug: "pipeline",
    title: "Pipeline DBSCAN + Random Forest",
    short: "Pipeline",
    icon: GitBranch,
    tagline: "Entraînement final avec les meilleurs hyperparamètres",
    brief:
      "Le cœur du système, avec les hyperparamètres de l'étape 6. Split 10 % labeled / 40 % pool / 50 % test. DBSCAN sur 1 500 points, calcul du cluster_fp_rate, puis Random Forest et prédictions sur les 33 115 alertes de test. Cette étape alimente aussi les ateliers interactifs.",
    conclusion:
      "F1 ≈ 0,87 et ROC-AUC ≈ 0,97 sur 33 115 alertes jamais vues — bien au-dessus de mon 0,801 synthétique. Le modèle est prêt ; les ateliers ci-dessous le décortiquent en direct.",
    duration: "~5 s",
    endpoint: "/api/workflow/pipeline",
    parameters: [
      {
        key: "eps",
        label: "ε (DBSCAN)",
        type: "number",
        default: 0.25,
        min: 0.05,
        max: 0.6,
        step: 0.01,
        description: "Rayon de voisinage pour le clustering par densité. Pré-rempli avec le meilleur trouvé à l'étape 6.",
      },
      {
        key: "min_pts",
        label: "MinPts (DBSCAN)",
        type: "number",
        default: 3,
        min: 2,
        max: 30,
        step: 1,
        description: "Nombre minimum de voisins pour qu'un point soit core.",
      },
      {
        key: "n_estimators",
        label: "n_estimators (RF)",
        type: "number",
        default: 50,
        min: 5,
        max: 200,
        step: 5,
        description: "Nombre d'arbres dans la forêt aléatoire.",
      },
      {
        key: "max_depth",
        label: "max_depth (RF)",
        type: "number",
        default: 14,
        min: 2,
        max: 40,
        step: 1,
        description: "Profondeur maximale de chaque arbre.",
      },
    ],
    inheritDefaultsFrom: {
      stepSlug: "grid-search",
      mapping: {
        eps: "best_eps",
        min_pts: "best_min_pts",
        n_estimators: "best_n_estimators",
        max_depth: "best_max_depth",
      },
    },
    narration: [
      "Stratified split 10/40/50…",
      "DBSCAN sur 1 500 points labellisés sous-échantillonnés…",
      "Calcul du cluster_fp_rate + cluster_size par cluster…",
      "Entraînement du Random Forest sur 6 622 points × 11 features…",
      "Inférence sur 33 115 alertes de test…",
      "Cache des prédictions pour les ateliers interactifs…",
    ],
    outputParams: [
      { label: "F1-Score", path: "metrics.f1", format: "float", digits: 3 },
      { label: "ROC-AUC", path: "roc_auc", format: "float", digits: 3 },
      { label: "Précision", path: "metrics.precision", format: "float", digits: 3 },
      { label: "Rappel", path: "metrics.recall", format: "float", digits: 3 },
      { label: "Réduction des FP", path: "metrics.reduction", format: "pct" },
      { label: "Clusters DBSCAN", path: "n_clusters", format: "int" },
    ],
    deepDives: [
      {
        href: "/threshold",
        label: "Tuner de seuil",
        description: "Slider live avec confusion matrix et ROC",
      },
      {
        href: "/hyperparams",
        label: "Atelier hyperparamètres",
        description: "Sliders ε / MinPts / n_estimators / max_depth pour rejouer à la main",
      },
      {
        href: "/alerts",
        label: "Explorer les alertes",
        description: "Drill-down par alerte avec le code Java surligné",
      },
    ],
  },
  {
    number: 8,
    slug: "baselines",
    title: "Comparaison avec les baselines",
    short: "Baselines",
    icon: BarChart3,
    tagline: "Pipeline vs RF seul vs GROUP BY vs random",
    brief:
      "Je compare mon pipeline aux 4 baselines demandées par le jury : random (B0), majority (B1), RF seul sans DBSCAN (B2), et GROUP BY rule_id avec smoothing (B4). La question : est-ce que le pipeline complet bat une simple requête statistique ?",
    conclusion:
      "Mon pipeline bat le GROUP BY de 11 points de F1 (0,874 vs 0,760) sur 66 k alertes. « Une requête statistique suffirait » : non, pas à cette échelle. Le ML apporte vraiment quelque chose.",
    duration: "< 5 s",
    endpoint: "/api/workflow/baselines",
    narration: [
      "Calcul B0 random uniforme…",
      "Calcul B1 majority class…",
      "Re-train RF sans cluster_fp_rate (B2)…",
      "Aggregation per-rule FP rate + smoothing Laplace (B4)…",
      "Comparaison F1 sur les 33 115 alertes de test…",
    ],
    outputParams: [
      { label: "Pipeline F1", path: "pipeline.f1", format: "float", digits: 3 },
      { label: "RF seul F1", path: "rf_only.f1", format: "float", digits: 3 },
      { label: "GROUP BY F1", path: "groupby.f1", format: "float", digits: 3 },
      { label: "Δ ML vs GROUP BY", path: "delta_vs_groupby", format: "float", digits: 3 },
    ],
  },
  {
    number: 9,
    slug: "active-learning",
    title: "Apprentissage actif (5 cycles)",
    short: "Active Learning",
    icon: Beaker,
    tagline: "Uncertainty sampling · oracle parfait + bruité 10 %",
    brief:
      "5 cycles d'apprentissage actif : à chaque tour je prends les 150 alertes les plus incertaines, je les fais labelliser par un oracle, je les ajoute et je ré-entraîne. Variante bruitée : j'inverse 10 % des labels pour simuler des erreurs humaines.",
    conclusion:
      "In-distribution, l'AL ne gagne qu'1 point : normal, le modèle part déjà très haut (0,874). Bonne surprise : 10 % de labels faux ne le dérangent presque pas. Là où l'AL devient utile, c'est sur un dataset nouveau — voir l'atelier Adaptation.",
    duration: "~10 s",
    endpoint: "/api/workflow/active-learning",
    narration: [
      "Cycle 1 — sélection des 150 alertes les plus incertaines…",
      "Ré-entraînement du RF sur le train augmenté…",
      "Cycle 2 …",
      "Variante bruitée : injection de 10 % d'erreurs d'annotation…",
    ],
    outputParams: [
      { label: "F1 cycle 0", path: "perfect.f1_start", format: "float", digits: 3 },
      { label: "F1 cycle 5 (parfait)", path: "perfect.f1_end", format: "float", digits: 3 },
      { label: "Δ F1 parfait", path: "perfect.delta", format: "float", digits: 3 },
      { label: "F1 cycle 5 (bruité)", path: "noisy.f1_end", format: "float", digits: 3 },
      { label: "Δ F1 bruité", path: "noisy.delta", format: "float", digits: 3 },
    ],
    deepDives: [
      {
        href: "/active-learning",
        label: "Labo d'AL interactif",
        description: "Tu joues l'oracle toi-même, alerte par alerte",
      },
    ],
  },
  {
    number: 10,
    slug: "verdicts",
    title: "Verdicts H1 / H2 / H3",
    short: "Verdicts",
    icon: Award,
    tagline: "Le bilan final sur les 3 hypothèses du mémoire",
    brief:
      "J'applique les critères chiffrés du mémoire aux résultats réels. H1 : réduction > 50 % ET rappel ≥ 85 %. H2 : ΔF1 (pipeline vs RF seul) ≥ 5 pts. H3 : ΔF1 (AL 5 cycles) ≥ 3 %. Et je compare au verdict du synthétique.",
    conclusion:
      "Le bilan : H1 passe de partielle à validée sur le réel (69 % filtrés, 86 % des failles gardées). H2 et H3 restent non validées, mais je sais pourquoi (DBSCAN aide enfin ; l'AL plafonne car le modèle part haut). L'essentiel tient : ça marche sur du réel indépendant, et mes 3 critiques ont chacune leur réponse chiffrée.",
    duration: "instantané",
    endpoint: null,
    narration: [
      "Lecture des résultats des étapes précédentes…",
      "Application des critères H1, H2, H3 du mémoire…",
      "Confrontation avec les verdicts du synthétique…",
    ],
    outputParams: [
      { label: "H1 (réel)", path: "H1", format: "string" },
      { label: "H2 (réel)", path: "H2", format: "string" },
      { label: "H3 parfait (réel)", path: "H3_perfect", format: "string" },
      { label: "H3 bruité (réel)", path: "H3_noisy", format: "string" },
    ],
  },
];

export function getStep(slug: string) {
  return WORKFLOW.find((s) => s.slug === slug);
}

export function nextStep(slug: string) {
  const i = WORKFLOW.findIndex((s) => s.slug === slug);
  return WORKFLOW[i + 1] ?? null;
}

export function prevStep(slug: string) {
  const i = WORKFLOW.findIndex((s) => s.slug === slug);
  return i > 0 ? WORKFLOW[i - 1] : null;
}
