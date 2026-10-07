const STORAGE_KEY = 'metabolic.planPrintOrientation';

export type PlanPrintOrientation = 'vertical' | 'horizontal';

export function readPlanPrintOrientation(): PlanPrintOrientation {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'horizontal' ? 'horizontal' : 'vertical';
  } catch {
    return 'vertical';
  }
}

export function writePlanPrintOrientation(value: PlanPrintOrientation) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode or a full store — the in-memory choice still applies this session.
  }
}
