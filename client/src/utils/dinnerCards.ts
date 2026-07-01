/** Contract of GET /api/daily-logs/:date/dinner-cards (see server mealCardService). */
export type DinnerCardFood = {
  foodId: string;
  name: string;
  servings: number;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  free: boolean;
  rounded: boolean;
};

export type DinnerCardOption = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isDefault: boolean;
  sortOrder: number;
  foods: DinnerCardFood[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
};

export type DinnerCardRole = 'STYLE' | 'PROTEIN' | 'FAT' | 'CARB' | 'VEGETABLE' | 'FRUIT' | 'FREE';

export type DinnerCard = {
  id: string;
  role: DinnerCardRole;
  name: string;
  pickRule: string | null;
  required: boolean;
  maxSelect: number;
  sortOrder: number;
  options: DinnerCardOption[];
};

export type DinnerCardsPayload = {
  setId: string;
  setName: string;
  mealNumber: number;
  mealName: string;
  targetCalories: number;
  referenceCalories: number;
  cards: DinnerCard[];
  savedSelections: { setId: string; picks: Record<string, string | string[]> } | null;
};

export type DinnerPicks = Record<string, string[]>;

export function defaultPicks(cards: DinnerCard[]): DinnerPicks {
  const picks: DinnerPicks = {};
  for (const card of cards) {
    const def = card.options.find((o) => o.isDefault) ?? (card.required ? card.options[0] : undefined);
    picks[card.id] = def ? [def.id] : [];
  }
  return picks;
}

/** Saved picks win where valid; unknown cards/options fall back to defaults. */
export function restorePicks(cards: DinnerCard[], saved: Record<string, string | string[]>): DinnerPicks {
  const picks = defaultPicks(cards);
  for (const card of cards) {
    const raw = saved[card.id];
    if (raw == null) continue;
    const ids = (Array.isArray(raw) ? raw : [raw]).filter((id) => card.options.some((o) => o.id === id));
    picks[card.id] = ids;
  }
  return picks;
}

export function togglePick(card: DinnerCard, picks: DinnerPicks, optionId: string): DinnerPicks {
  const current = picks[card.id] ?? [];
  if (card.maxSelect <= 1) return { ...picks, [card.id]: [optionId] };
  if (current.includes(optionId)) return { ...picks, [card.id]: current.filter((id) => id !== optionId) };
  if (current.length >= card.maxSelect) return picks;
  return { ...picks, [card.id]: [...current, optionId] };
}

export function selectionTotals(cards: DinnerCard[], picks: DinnerPicks) {
  let calories = 0;
  let protein = 0;
  for (const card of cards) {
    for (const optionId of picks[card.id] ?? []) {
      const option = card.options.find((o) => o.id === optionId);
      if (!option) continue;
      calories += option.totals.calories;
      protein += option.totals.protein;
    }
  }
  return { calories: Math.round(calories), protein: Math.round(protein) };
}

/** First blood-sugar role (protein/carb/veg) present in the set but left unpicked. */
export function missingCoverageRole(cards: DinnerCard[], picks: DinnerPicks) {
  const covered = new Set(cards.filter((card) => (picks[card.id] ?? []).length > 0).map((card) => card.role));
  return (['PROTEIN', 'CARB', 'VEGETABLE'] as const).find(
    (role) => cards.some((card) => card.role === role) && !covered.has(role)
  );
}

export function foodsLabel(option: DinnerCardOption) {
  if (!option.foods.length) return option.description ?? '';
  return option.foods
    .map((f) => `${f.quantity} ${f.unit}${f.rounded ? ' (rounded)' : ''}${f.free ? ' · free' : ''}`)
    .join(' + ');
}

/** POST body shape: single-select cards send a string, multi-select send arrays. */
export function picksToSelections(cards: DinnerCard[], picks: DinnerPicks) {
  const selections: Record<string, string | string[]> = {};
  for (const card of cards) {
    const ids = picks[card.id] ?? [];
    if (!ids.length) continue;
    selections[card.id] = card.maxSelect <= 1 ? ids[0] : ids;
  }
  return selections;
}
