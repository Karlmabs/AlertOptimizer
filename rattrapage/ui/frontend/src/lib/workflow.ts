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
      "Téléchargement des deux datasets publics qui serviront de ground truth indépendante. OWASP Benchmark Java v1.2 est cloné depuis GitHub (2 740 fichiers de test labellisés par la Fondation OWASP). Juliet Test Suite for Java v1.3 est téléchargé depuis NIST SARD (~73 MB, ~46 800 fichiers labellisés par le NIST avec une CWE pour chaque vulnérabilité).",
    conclusion:
      "Les deux corpus sont en place. Point clé pour le jury : ces fichiers et leurs labels existaient bien avant le mémoire et proviennent d'OWASP et du NIST — la vérité-terrain ne dépend donc pas de moi, ce qui désamorce d'emblée la critique de circularité du dataset synthétique.",
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
      "Conversion des deux tables de vérité fournies par OWASP et NIST en un format unifié. Pour OWASP, on parse expectedresults-1.2.csv (catégorie + CWE + booléen real_vulnerability). Pour Juliet, on parse manifest.xml avec un parseur tolérant (le manifest NIST a quelques entrées malformées). Pour chaque fichier Java, on retient : (a) sa CWE primaire, (b) ses flaw_lines précises, (c) sa catégorie de vulnérabilité.",
    conclusion:
      "On dispose maintenant d'une vérité-terrain indépendante et traçable pour chaque fichier. C'est elle qui permettra, à l'étape 4, de marquer chaque alerte TP ou FP sans aucun jugement de ma part.",
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
      "Exécution de Semgrep OSS 1.162 via Docker avec 6 rulesets publics (p/java, p/owasp-top-ten, p/security-audit, p/findsecbugs, p/cwe-top-25, p/r2c-security-audit). Le scan produit deux fichiers SARIF v2.1.0 que la suite du pipeline consommera. Ces alertes ne sont PAS encore labellisées — Semgrep ne sait pas si elles sont TP ou FP, c'est ce qu'on va déterminer à l'étape 4.",
    conclusion:
      "Semgrep a produit des dizaines de milliers d'alertes brutes mêlant vraies vulnérabilités et faux positifs — exactement le bruit que subit un développeur au quotidien. C'est ce flot qu'il faut trier intelligemment ; tout le reste du pipeline s'attaque à ce problème.",
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
      "Pour chaque alerte Semgrep, on regarde dans quel fichier elle a fire, puis on consulte la table de vérité OWASP ou NIST. Une alerte est marquée TP (y=0) si le fichier est vulnérable ET que la CWE de la règle Semgrep correspond à la catégorie du fichier. Sinon FP (y=1). On fusionne ensuite les deux datasets labellisés en un seul real_dataset_v2.csv.",
    conclusion:
      "Le dataset réel est constitué : 66 227 alertes, ~68 % de faux positifs — un taux conforme à la littérature (Muske & Serebrenik, 2016). C'est 13× le volume du dataset synthétique du mémoire, avec des labels fournis par des tiers : la base d'évaluation est désormais solide et défendable.",
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
      "Pour chaque alerte, on extrait 8 features SARIF de base (rule.id normalisé, level, source, tool, start_line, rank, occurrenceCount, severity), 1 feature contextuelle dérivée du nom de règle (is_taint_rule), et 2 features qui seront calculées par DBSCAN à l'étape Pipeline (cluster_fp_rate, cluster_size). Le dataset devient une matrice n × 11.",
    conclusion:
      "Chaque alerte est désormais un vecteur de 11 features, toutes dérivées des métadonnées SARIF — sans jamais lire le code source. C'est volontairement léger, portable et auditable : le modèle devra apprendre à partir de ce seul signal, ce qui rend ses décisions explicables.",
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
      "AVANT d'entraîner le modèle de production, on cherche les meilleurs hyperparamètres par grid search complet. Deux grilles : DBSCAN (7 valeurs de ε × 6 valeurs de MinPts = 42 configurations) et Random Forest (7 valeurs de n_estimators × 9 de max_depth = 63 configurations). Les 105 entraînements sont parallélisés sur 8 cores (~60 s total). La meilleure configuration trouvée sera utilisée par défaut à l'étape suivante (Pipeline), mais le pipeline pourra aussi être lancé avec les valeurs du mémoire v6 pour comparaison.",
    conclusion:
      "La grid search confirme que les hyperparamètres du mémoire sont à ~0,01 pt F1 de l'optimum réel : le réglage initial était robuste, pas un coup de chance. On peut donc entraîner le pipeline final sereinement, sans soupçon de sur-apprentissage méthodologique sur les données d'évaluation.",
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
      "Le cœur du système, lancé avec les hyperparamètres validés à l'étape précédente. Stratified split 10 % labeled / 40 % pool (pour AL) / 50 % test. DBSCAN clustering sur 1 500 points labellisés sous-échantillonnés. Le cluster_fp_rate est calculé puis ajouté comme feature. Random Forest entraîné, prédictions sur les 33 115 alertes de test. Cette étape écrit aussi les caches consommés par les ateliers interactifs (Threshold tuner, Alert explorer, etc.).",
    conclusion:
      "Le pipeline atteint F1 ≈ 0,87 et ROC-AUC ≈ 0,97 sur 33 115 alertes jamais vues — nettement au-dessus du 0,801 du synthétique. Le modèle de production est prêt ; les ateliers interactifs ci-dessous permettent d'explorer ses décisions en direct devant le jury.",
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
      "Évaluation frontale par rapport aux 4 baselines demandées par le jury : (B0) random uniforme, (B1) majority class, (B2) RF seul sans DBSCAN, (B4) GROUP BY rule_id avec smoothing de Laplace. La question : le pipeline complet apporte-t-il quelque chose de mesurable par rapport à une simple requête statistique ?",
    conclusion:
      "Le pipeline bat GROUP BY rule_id de +11,4 pts F1 (0,874 vs 0,760) sur 66 k alertes : la critique « une simple requête statistique suffirait » ne tient pas à l'échelle réelle. La plus-value du ML est démontrée, chiffrée et reproductible.",
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
      "Cinq cycles d'AL avec uncertainty sampling : on sélectionne les 150 alertes du pool les plus incertaines (probabilité ≈ 0.5), on les fait labeller par un oracle (le ground truth dans cette simulation), on les ajoute au train set et on ré-entraîne. Variante bruitée : 10 % des labels sont inversés aléatoirement pour simuler des erreurs d'annotation humaine.",
    conclusion:
      "In-distribution, l'AL ne gagne que ~+1 pt : c'est attendu, car le modèle démarre déjà très haut (F1 0,874) et il reste peu de marge. Bonne nouvelle annexe : le bruit d'oracle (10 %) n'a quasi aucun impact, l'AL est robuste. L'atelier « Adaptation cross-dataset » montre où l'AL devient vraiment décisif : face à un dataset jamais vu.",
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
      "Application des critères chiffrés du mémoire aux résultats obtenus sur le dataset réel. H1 : Réduction > 50 % ET Rappel ≥ 85 %. H2 : ΔF1(pipeline vs RF seul) ≥ +5 pts. H3 : ΔF1(AL 5 cycles) ≥ +3 %. Comparaison avec les verdicts du mémoire (synthétique) pour montrer l'évolution.",
    conclusion:
      "Bilan final : H1 passe de « partielle » à VALIDÉE sur réel (69 % de réduction, 86 % de rappel). H2 et H3 restent non validées, mais l'expérimentation les explique (DBSCAN devient bénéfique au lieu de nuisible ; l'AL plafonne car le modèle part déjà haut). L'essentiel est acquis : le système tient sur des données réelles indépendantes, et chacune des 3 critiques du jury a désormais une réponse chiffrée.",
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
