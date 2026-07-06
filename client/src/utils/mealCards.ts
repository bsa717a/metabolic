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
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  referenceCalories: number;
  dailyTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  cards: BuilderCard[];
  savedSelections: { setId: string; picks: Record<string, string | string[]>; quantities?: Record<string, number> } | null;
};

export type RecommendedMealItem = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  role: CardRole;
};

/** One AI-recommended complete meal (GET /api/daily-logs/:date/meal-recommendations). */
export type RecommendedMeal = {
  name: string;
  description: string;
  items: RecommendedMealItem[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  withinBand: boolean;
  bloodSugarStable: boolean;
};

export type MealRecommendationsPayload = {
  mealNumber: number;
  targetCalories: number;
  options: RecommendedMeal[];
};

export type BuilderPicks = Record<string, string[]>;
export type QuantityOverrides = Record<string, number>;

export type SelectedFoodLine = CardFood & { optionId: string; cardName: string };

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

export function selectedFoodLines(cards: BuilderCard[], picks: BuilderPicks): SelectedFoodLine[] {
  const lines: SelectedFoodLine[] = [];
  for (const card of cards) {
    for (const optionId of picks[card.id] ?? []) {
      const option = card.options.find((entry) => entry.id === optionId);
      if (!option) continue;
      for (const food of option.foods) {
        lines.push({ ...food, optionId, cardName: card.name });
      }
    }
  }
  return lines;
}

function scaledFood(food: CardFood, quantity: number): CardFood {
  if (quantity <= 0 || food.quantity <= 0) return food;
  const factor = quantity / food.quantity;
  return {
    ...food,
    quantity,
    servings: food.servings * factor,
    calories: food.calories * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor
  };
}

export function foodQuantityKey(line: Pick<SelectedFoodLine, 'optionId' | 'foodId'>) {
  return `${line.optionId}:${line.foodId}`;
}

export function foodQuantity(line: SelectedFoodLine, overrides: QuantityOverrides) {
  return overrides[foodQuantityKey(line)] ?? overrides[line.foodId] ?? line.quantity;
}

export function selectionTotals(cards: BuilderCard[], picks: BuilderPicks, quantityOverrides: QuantityOverrides = {}) {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;

  for (const line of selectedFoodLines(cards, picks)) {
    const qty = foodQuantity(line, quantityOverrides);
    const scaled = scaledFood(line, qty);
    calories += scaled.calories;
    protein += scaled.protein;
    carbs += scaled.carbs;
    fat += scaled.fat;
  }

  for (const card of cards) {
    for (const optionId of picks[card.id] ?? []) {
      const option = card.options.find((entry) => entry.id === optionId);
      if (!option || option.foods.length) continue;
      calories += option.totals.calories;
      protein += option.totals.protein;
      carbs += option.totals.carbs;
      fat += option.totals.fat;
    }
  }

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat)
  };
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

/** Drop quantity overrides for foods no longer in the current picks. */
export function pruneQuantityOverrides(
  cards: BuilderCard[],
  picks: BuilderPicks,
  overrides: QuantityOverrides
): QuantityOverrides {
  const active = new Set(selectedFoodLines(cards, picks).map((line) => foodQuantityKey(line)));
  const next: QuantityOverrides = {};
  for (const [key, quantity] of Object.entries(overrides)) {
    if (active.has(key) || active.has(key.split(':').pop()!)) next[key] = quantity;
  }
  return next;
}
