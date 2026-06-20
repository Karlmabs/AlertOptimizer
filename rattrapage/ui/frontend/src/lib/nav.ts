import type { LucideIcon } from "lucide-react";
import {
  Home,
  Database,
  ListTree,
  Sliders,
  GaugeCircle,
  Beaker,
  Play,
  ShieldCheck,
  TrendingUp,
  Sigma,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Workbench workflow steps — ordered so the sidebar reads as a left-to-right
 * progression through the project. Each step is interactive; clicks trigger
 * real work rather than slide playback.
 */
export const NAV: NavItem[] = [
  {
    href: "/",
    label: "Vue d'ensemble",
    short: "Overview",
    description: "Métriques globales et raccourcis vers chaque atelier",
    icon: Home,
  },
  {
    href: "/dataset",
    label: "Dataset",
    short: "Dataset",
    description: "66 227 alertes labellisées — OWASP + Juliet via Semgrep",
    icon: Database,
  },
  {
    href: "/alerts",
    label: "Explorateur d'alertes",
    short: "Alerts",
    description: "Drill-down sur chaque alerte avec le code Java surligné",
    icon: ListTree,
  },
  {
    href: "/threshold",
    label: "Tuner de seuil",
    short: "Threshold",
    description: "Slider live — confusion matrix + ROC qui se mettent à jour",
    icon: GaugeCircle,
  },
  {
    href: "/hyperparams",
    label: "Atelier hyperparamètres",
    short: "Hyperparams",
    description: "ε, MinPts, n_estimators, max_depth — retrain en 3-5 s",
    icon: Sliders,
  },
  {
    href: "/active-learning",
    label: "Labo d'apprentissage actif",
    short: "Active Learning",
    description: "Tu joues l'oracle, le modèle se ré-entraîne cycle par cycle",
    icon: Beaker,
  },
  {
    href: "/generalization",
    label: "Épreuve de généralisation",
    short: "Generalization",
    description: "LODO cross-dataset + ablation rule.id — le test qui répond au jury",
    icon: ShieldCheck,
  },
  {
    href: "/al-cross",
    label: "Adaptation cross-dataset",
    short: "AL cross",
    description: "L'apprentissage actif récupère le gap — incertitude vs aléatoire",
    icon: TrendingUp,
  },
  {
    href: "/significance",
    label: "Significativité statistique",
    short: "Stats",
    description: "McNemar + IC bootstrap sur l'écart de 11,2 pts vs GROUP BY",
    icon: Sigma,
  },
  {
    href: "/runs",
    label: "Exécutions complètes",
    short: "Runs",
    description: "Lance les 8 EXP ou le grid search en stream live",
    icon: Play,
  },
];

export function navIndex(pathname: string) {
  const i = NAV.findIndex((n) => n.href === pathname);
  return i === -1 ? 0 : i;
}
