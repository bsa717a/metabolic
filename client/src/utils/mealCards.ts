/** Contract of GET /api/daily-logs/:date/dinner-cards (see server mealCardService). */
export type CardFood = {
  foodId: string;
  name: string;
  imageUrl: string | null;
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

export type CardOption = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isDefault: boolean;
  sortOrder: number;
  foods: CardFood[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
};

export type CardRole = 'STYLE' | 'PROTEIN' | 'FAT' | 'CARB' | 'VEGETABLE' | 'FRUIT' | 'FREE';

export type BuilderCard = {
  id: string;
  role: CardRole;
  name: string;
  pickRule: string | null;
  required: boolean;
  maxSelect: number;
  sortOrder: number;
  options: CardOption[];
};

export type MealSlotType = 'BREAKFAST' | 'SNACK' | 'LUNCH' | 'DINNER';

export type MealCardsPayload = {
  setId: string;
  setName: string;
  slotType: MealSlotType;
  mealNumber: number;
  mealName: string;
  targetCalories: number;
  referenceCalories: number;
  cards: BuilderCard[];
  savedSelections: { setId: string; picks: Record<string, string | string[]> } | null;
};

export type BuilderPicks = Record<string, string[]>;

export function defaultPicks(cards: BuilderCard[]): BuilderPicks {
  const picks: BuilderPicks = {};
  for (const card of cards) {
    const def = card.options.find((o) => o.isDefault) ?? (card.required ? card.options[0] : undefined);
    picks[card.id] = def ? [def.id] : [];
  }
  return picks;
}

/** Saved picks win where valid; unknown cards/options fall back to defaults. */
export function restorePicks(cards: BuilderCard[], saved: Record<string, string | string[]>): BuilderPicks {
  const picks = defaultPicks(cards);
  for (const card of cards) {
    const raw = saved[card.id];
    if (raw == null) continue;
    const ids = (Array.isArray(raw) ? raw : [raw]).filter((id) => card.options.some((o) => o.id === id));
    picks[card.id] = ids;
  }
  return picks;
}

export function togglePick(card: BuilderCard, picks: BuilderPicks, optionId: string): BuilderPicks {
  const current = picks[card.id] ?? [];
  if (card.maxSelect <= 1) return { ...picks, [card.id]: [optionId] };
  if (current.includes(optionId)) return { ...picks, [card.id]: current.filter((id) => id !== optionId) };
  if (current.length >= card.maxSelect) return picks;
  return { ...picks, [card.id]: [...current, optionId] };
}

export function selectionTotals(cards: BuilderCard[], picks: BuilderPicks) {
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
export function missingCoverageRole(cards: BuilderCard[], picks: BuilderPicks) {
  const covered = new Set(cards.filter((card) => (picks[card.id] ?? []).length > 0).map((card) => card.role));
  return (['PROTEIN', 'CARB', 'VEGETABLE'] as const).find(
    (role) => cards.some((card) => card.role === role) && !covered.has(role)
  );
}

export function foodsLabel(option: CardOption) {
  if (!option.foods.length) return option.description ?? '';
  return option.foods
    .map((f) => `${f.quantity} ${f.unit}${f.rounded ? ' (rounded)' : ''}${f.free ? ' · free' : ''}`)
    .join(' + ');
}

/** POST body shape: single-select cards send a string, multi-select send arrays. */
export function picksToSelections(cards: BuilderCard[], picks: BuilderPicks) {
  const selections: Record<string, string | string[]> = {};
  for (const card of cards) {
    const ids = picks[card.id] ?? [];
    if (!ids.length) continue;
    selections[card.id] = card.maxSelect <= 1 ? ids[0] : ids;
  }
  return selections;
}
