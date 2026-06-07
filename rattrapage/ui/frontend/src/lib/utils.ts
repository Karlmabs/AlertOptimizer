import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPct(v: number, digits = 1) {
  return `${(v * 100).toFixed(digits)}%`;
}

export function formatNumber(v: number, digits = 3) {
  return v.toFixed(digits);
}

export function formatInt(v: number) {
  return new Intl.NumberFormat("fr-FR").format(v);
}
