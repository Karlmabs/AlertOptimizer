"use client";

/**
 * Tiny workflow status store backed by localStorage.
 * Keeps per-step status across page navigations without any external lib.
 */

export type StepStatus = "pending" | "running" | "done" | "error";

export type StepState = {
  status: StepStatus;
  // Last run result (small JSON blob — large data lives in /public/data)
  result?: Record<string, unknown>;
  // ISO timestamp of last run
  finishedAt?: string;
  // Parameters used last time
  params?: Record<string, unknown>;
};

const KEY = "alertoptimizer.workflow.v1";

type Store = Record<string, StepState>;

const listeners = new Set<() => void>();

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

function write(s: Store) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((l) => l());
  // Also notify across tabs
  window.dispatchEvent(new CustomEvent("workflow:update"));
}

export function getStepState(slug: string): StepState {
  return read()[slug] ?? { status: "pending" };
}

export function setStepState(slug: string, state: Partial<StepState>) {
  const s = read();
  s[slug] = { ...(s[slug] ?? { status: "pending" }), ...state };
  write(s);
}

export function getAllStates(): Store {
  return read();
}

export function resetAll() {
  write({});
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (typeof window !== "undefined") {
    window.addEventListener("workflow:update", fn);
    window.addEventListener("storage", fn);
  }
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") {
      window.removeEventListener("workflow:update", fn);
      window.removeEventListener("storage", fn);
    }
  };
}
