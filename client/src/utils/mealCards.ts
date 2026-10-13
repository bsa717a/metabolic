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
  discrete?: boolean;
  unitStep?: number;
  minServings?: number | null;
  maxServings?: number | null;
};

export type CardOption = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isDefault: boolean;
  sortOrder: number;
  /** When set, only visible if that upstream option is currently picked. */
  visibleWhenOptionId?: string | null;
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
  visibleWhenOptionId?: string | null;
  hiddenForOptionIds?: string[];
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

export function selectedOptionIdSet(picks: BuilderPicks): Set<string> {
  const ids = new Set<string>();
  for (const list of Object.values(picks)) {
    for (const id of list) ids.add(id);
  }
  return ids;
}

export function isOptionVisible(option: CardOption, picks: BuilderPicks): boolean {
  if (!option.visibleWhenOptionId) return true;
  return selectedOptionIdSet(picks).has(option.visibleWhenOptionId);
}

export function isCardOnPath(card: BuilderCard, picks: BuilderPicks): boolean {
  const selected = selectedOptionIdSet(picks);
  if (card.visibleWhenOptionId && !selected.has(card.visibleWhenOptionId)) return false;
  if ((card.hiddenForOptionIds ?? []).some((id) => selected.has(id))) return false;
  return true;
}

export function visibleOptions(card: BuilderCard, picks: BuilderPicks): CardOption[] {
  return card.options.filter((option) => isOptionVisible(option, picks));
}

/** Cards that currently have at least one visible option (path-aware wizard steps). */
export function activeCards(cards: BuilderCard[], picks: BuilderPicks): BuilderCard[] {
  return [...cards]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((card) => isCardOnPath(card, picks) && visibleOptions(card, picks).length > 0);
}

/**
 * Drop picks that are off-path; refill required cards with a visible default.
 * Processes cards in sort order so earlier gates unlock later defaults.
 */
export function pruneAndRefillPicks(cards: BuilderCard[], picks: BuilderPicks): BuilderPicks {
  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
  const next: BuilderPicks = {};
  for (const card of sorted) {
    const merged = { ...picks, ...next };
    if (!isCardOnPath(card, merged)) {
      next[card.id] = [];
      continue;
    }
    const visible = visibleOptions(card, merged);
    const visibleIds = new Set(visible.map((option) => option.id));
    let ids = (picks[card.id] ?? []).filter((id) => visibleIds.has(id));
    if (!ids.length && card.required && visible.length) {
      const def = visible.find((option) => option.isDefault) ?? visible[0];
      ids = def ? [def.id] : [];
    }
    next[card.id] = ids;
  }
  return next;
}

export function defaultPicks(cards: BuilderCard[]): BuilderPicks {
  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
  const picks: BuilderPicks = {};
  for (const card of sorted) {
    if (!isCardOnPath(card, picks)) {
      picks[card.id] = [];
      continue;
    }
    const visible = visibleOptions(card, picks);
    const def = visible.find((o) => o.isDefault) ?? (card.required ? visible[0] : undefined);
    picks[card.id] = def ? [def.id] : [];
  }
  return picks;
}

/** Saved picks win where valid; unknown/off-path options fall back to defaults. */
export function restorePicks(cards: BuilderCard[], saved: Record<string, string | string[]>): BuilderPicks {
  const picks = defaultPicks(cards);
  for (const card of cards) {
    const raw = saved[card.id];
    if (raw == null) continue;
    const ids = (Array.isArray(raw) ? raw : [raw]).filter((id) => card.options.some((o) => o.id === id));
    picks[card.id] = ids;
  }
  return pruneAndRefillPicks(cards, picks);
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
    if (!isCardOnPath(card, picks)) continue;
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

function roundToStep(value: number, step: number) {
  if (step <= 0) return Math.round(value * 100) / 100;
  return Math.round(value / step) * step;
}

function isDiscreteLine(line: SelectedFoodLine) {
  return Boolean(line.discrete) || (line.rounded && Number.isInteger(line.servings));
}

function quantityAfterFactor(line: SelectedFoodLine, qty: number, factor: number) {
  if (qty <= 0 || line.quantity <= 0 || line.servings <= 0) return qty;
  const qtyPerServing = line.quantity / line.servings;
  const newServings = (qty / qtyPerServing) * factor;
  if (isDiscreteLine(line)) {
    const step = line.unitStep && line.unitStep > 0 ? line.unitStep : 1;
    let snapped = Math.max(step, Math.round(newServings / step) * step);
    if (line.minServings != null && snapped < line.minServings) snapped = line.minServings;
    if (line.maxServings != null && snapped > line.maxServings) snapped = line.maxServings;
    return Math.round(snapped * qtyPerServing * 100) / 100;
  }
  return Math.round(Math.max(0.25, roundToStep(newServings * qtyPerServing, 0.25)) * 100) / 100;
}

/**
 * Resize the current plate so scalable foods hit the meal calorie target.
 * Discrete items (eggs) snap to whole units; leftover error goes to continuous foods.
 */
export function rebalanceSelectionToTarget(
  lines: SelectedFoodLine[],
  targetCalories: number,
  overrides: QuantityOverrides = {}
): QuantityOverrides {
  if (targetCalories <= 0 || !lines.length) return {};

  const items = lines.map((line) => {
    const qty = foodQuantity(line, overrides);
    return { line, qty, scaled: scaledFood(line, qty) };
  });
  const freeCalories = items.filter((item) => item.line.free).reduce((sum, item) => sum + item.scaled.calories, 0);
  const scalable = items.filter((item) => !item.line.free && item.scaled.calories > 0);
  const scalableCalories = scalable.reduce((sum, item) => sum + item.scaled.calories, 0);
  if (scalableCalories <= 0) return {};

  const remaining = targetCalories - freeCalories;
  const factor = remaining > 0 ? remaining / scalableCalories : 0;
  const next: QuantityOverrides = {};
  const qtyByKey = new Map<string, number>();
  for (const item of items) {
    if (item.line.free) continue;
    const key = foodQuantityKey(item.line);
    const qty = quantityAfterFactor(item.line, item.qty, factor);
    qtyByKey.set(key, qty);
    next[key] = qty;
  }

  let actual = freeCalories;
  for (const item of items) {
    if (item.line.free) continue;
    actual += scaledFood(item.line, qtyByKey.get(foodQuantityKey(item.line))!).calories;
  }
  const error = targetCalories - actual;
  const continuous = items.filter((item) => !item.line.free && !isDiscreteLine(item.line));
  const continuousCalories = continuous.reduce(
    (sum, item) => sum + scaledFood(item.line, qtyByKey.get(foodQuantityKey(item.line))!).calories,
    0
  );
  if (Math.abs(error) >= 1 && continuousCalories > 0) {
    const adjust = (continuousCalories + error) / continuousCalories;
    if (adjust > 0) {
      for (const item of continuous) {
        const key = foodQuantityKey(item.line);
        const qty = quantityAfterFactor(item.line, qtyByKey.get(key)!, adjust);
        qtyByKey.set(key, qty);
        next[key] = qty;
      }
    }
  }

  return next;
}

export function quantityInputStep(line: SelectedFoodLine) {
  if (!isDiscreteLine(line) || line.servings <= 0 || line.quantity <= 0) return 0.25;
  const step = line.unitStep && line.unitStep > 0 ? line.unitStep : 1;
  return (line.quantity / line.servings) * step;
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
    if (!isCardOnPath(card, picks)) continue;
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
  const onPath = cards.filter((card) => isCardOnPath(card, picks));
  const covered = new Set(onPath.filter((card) => (picks[card.id] ?? []).length > 0).map((card) => card.role));
  return (['PROTEIN', 'CARB', 'VEGETABLE'] as const).find(
    (role) => onPath.some((card) => card.role === role) && !covered.has(role)
  );
}

export function foodsLabel(option: CardOption) {
  if (!option.foods.length) return option.description ?? '';
  return option.foods
    .map((f) => `${f.quantity} ${f.unit}${f.rounded ? ' (rounded)' : ''}${f.free ? ' · free' : ''}`)
    .join(' + ');
}

/** Review-step header: options are scaled from the set's default combo, so stacked picks can miss the target. */
export function mealBuilderReviewSubtitle(inBand: boolean, calorieDelta: number): string {
  if (inBand) return 'This meal fits your target';
  return calorieDelta > 0 ? 'This combo is over your target' : 'This combo is under your target';
}

/** POST body shape: single-select cards send a string, multi-select send arrays. */
export function picksToSelections(cards: BuilderCard[], picks: BuilderPicks) {
  const pruned = pruneAndRefillPicks(cards, picks);
  const selections: Record<string, string | string[]> = {};
  for (const card of activeCards(cards, pruned)) {
    const ids = pruned[card.id] ?? [];
    if (!ids.length) continue;
    selections[card.id] = card.maxSelect <= 1 ? ids[0]! : ids;
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
