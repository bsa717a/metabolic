import { useState } from 'react';

/** Week title when the client has no saved nutrition plan. */
export const NO_NUTRITION_PLAN_ASSIGNED = 'No plan is assigned.';

/**
 * Shown by Apply plan.
 * A nutrition template is one day of meals. Applying it does not turn other
 * weekdays into rest days (that sentence belongs to exercise plans).
 */
export const APPLY_NUTRITION_PLAN_HINT = "Applying replaces this day's planned meals.";

export function assignedNutritionPlan(
  period: { templateId?: string | null; templateName?: string | null } | null
): { id: string; name: string } | null {
  const id = period?.templateId ?? null;
  const name = period?.templateName?.trim() ?? '';
  if (!id || !name) return null;
  return { id, name };
}

/** The saved plan stays in the list so the control can show its name. */
export function nutritionPlanPickerOptions(
  plans: { id: string; name: string }[],
  assigned: { id: string; name: string } | null
): { id: string; name: string }[] {
  const options = plans
    .filter((plan) => plan.id && plan.name.trim())
    .map((plan) => ({ id: plan.id, name: plan.name.trim() }));
  if (assigned && !options.some((plan) => plan.id === assigned.id)) {
    return [assigned, ...options];
  }
  return options;
}

/** Saved plan, unless the coach has picked a different one and not applied it yet. */
export function nutritionPlanPickerValue(assignedId: string | null, override: string | null): string {
  if (override !== null) return override;
  return assignedId ?? '';
}

export function useNutritionPlanPicker(
  templates: { id: string; name: string }[],
  assigned: { id: string; name: string } | null,
  scopeKey: string
) {
  const [override, setOverride] = useState<string | null>(null);
  const [seenScope, setSeenScope] = useState(scopeKey);
  if (seenScope !== scopeKey) {
    setSeenScope(scopeKey);
    setOverride(null);
  }
  return {
    options: nutritionPlanPickerOptions(templates, assigned),
    planId: nutritionPlanPickerValue(assigned?.id ?? null, override),
    onPlanIdChange: setOverride,
    clearOverride: () => setOverride(null)
  };
}
