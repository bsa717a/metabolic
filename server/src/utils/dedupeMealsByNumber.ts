type DedupeMeal = {
  mealNumber: number;
  status?: string;
  items?: readonly { type?: string }[];
};

function richness(meal: DedupeMeal) {
  const items = meal.items ?? [];
  return {
    actualCount: items.filter((item) => item.type === 'ACTUAL').length,
    logged: meal.status && meal.status !== 'PLANNED' ? 1 : 0,
    itemCount: items.length
  };
}

function isRicher(candidate: DedupeMeal, prev: DedupeMeal) {
  const next = richness(candidate);
  const current = richness(prev);
  if (next.actualCount !== current.actualCount) return next.actualCount > current.actualCount;
  if (next.logged !== current.logged) return next.logged > current.logged;
  return next.itemCount > current.itemCount;
}

/** Keep one meal per mealNumber, preferring logged/actual rows over empty planned shells. */
export function dedupeMealsByNumber<T extends DedupeMeal>(meals: T[]): T[] {
  const best = new Map<number, T>();
  for (const meal of meals) {
    const prev = best.get(meal.mealNumber);
    if (!prev || isRicher(meal, prev)) best.set(meal.mealNumber, meal);
  }
  return [...best.values()].sort((a, b) => a.mealNumber - b.mealNumber);
}
