import type { MacroTotals } from '../components/nutrition/MacroSummaryFooter';

export function sameMacroTotals(a: MacroTotals, b: MacroTotals) {
  return a.calories === b.calories && a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat;
}

export function nextDraftTotalsByMeal(
  prev: Record<string, MacroTotals>,
  mealId: string,
  totals: MacroTotals
) {
  const current = prev[mealId];
  if (current && sameMacroTotals(current, totals)) return prev;
  return { ...prev, [mealId]: totals };
}

export function clearDraftTotalsIfNeeded(prev: Record<string, MacroTotals>) {
  return Object.keys(prev).length === 0 ? prev : {};
}
