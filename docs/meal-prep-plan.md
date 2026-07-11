# Meal Prep Plan

Batch-cooking companion to the weekly plan: take the meals already planned across a
date range, group the ones that repeat, and tell the user what to cook at once and how
to portion it into bowls / ziplock bags / jars.

## North star

Meal prep is the **sibling of the shopping list**. `shoppingListService` walks every
`PLANNED` `MealItem` in a date range and rolls it up **by ingredient** ("buy 2 lbs
chicken"). Meal prep runs the same walk and rolls up **by meal** ("you eat the
chicken-and-rice bowl 5× this week → cook 5 servings at once, portion into 5 bowls").

The data already exists — planned meals are materialized per `DailyLog` — so slice 1
computes a prep plan on demand and persists nothing, exactly like the shopping list.

## Locked decisions

- **Ephemeral, computed** (no new schema). On-demand prep plan, print/share, same
  `meal_planning` feature gate as the shopping list. Add trackable "cooked/portioned"
  check-off state in a later slice only if usage justifies it.
- **Container + reheat suggestions via AI enrichment**, mirroring `enrichShoppingList`,
  with a deterministic rule-based mock fallback (never blocks on the AI).
- **Client self-serve**, opened from the existing `PlanActionsMenu` next to the
  shopping-list drawer.

## Core algorithm — `getMealPrepPlan(userId, start, end)`

1. **Collect planned meals in range.** Reuse the shopping-list range validation, then
   query the parent `Meal` (`name`, `cardSelections`, date) plus its planned `MealItem`s
   and each item's `Food` badge fields.
2. **Group into batches.** Batch identity, in priority order:
   - **`Meal.cardSelections`** (setId + picks) when present — card-backed meals with
     identical picks are provably the same dish.
   - Fall back to **normalized `Meal.name` plus ingredient names** for legacy / AI /
     manual meals. Quantities are omitted so portion-scaled copies still group, while
     generic slot names such as "Snack" do not merge unrelated dishes.
   Each group = one **prep batch**; `occurrenceCount` = number of containers.
3. **Scale the recipe.** Sum each item's `quantity` across the batch's occurrences → the
   total amount to cook in one go (per-serving × occurrences).
4. **Split cook-ahead vs add-fresh.** Use the `Food` badge fields the dinner-card work
   added (`role`, `textureTags`, `isFreeFood`) to separate "batch-cook now" (protein,
   grains) from "add fresh at serving" (avocado, greens, dressing) so perishables don't
   sit bagged for five days.
5. **Enrich for packaging.** Send each batch to the AI provider for a container
   suggestion (bowl / ziplock / jar-dressing-down), reheat note, and fridge/freezer
   guidance. Rule-based fallback: hot cooked → microwave-safe bowl/container; dry/handheld
   → bag; salad → jar. Fresh-adds are always flagged "add at serving."

Output shape (draft):

```
MealPrepPlan {
  startDate, endDate, plannedDayCount
  batches: [{
    label            // "Meal 3 · Chicken & rice bowl"
    occurrenceCount  // 5  → 5 containers
    dates            // ["Mon","Tue",...] for labeling containers
    cookNow:   [{ name, totalQuantity, unit }]   // scaled to the whole batch
    addFresh:  [{ name, quantityPerServing, unit, servingCount, dates }]
    container        // "microwave-safe bowl" | "ziplock bag" | "mason jar"
    reheat, storageNote
  }]
  note
}
```

## Server

- `server/src/services/mealPrepService.ts` — the algorithm above; reuses the extracted
  shared range query from `shoppingListService`.
- `AiProvider.enrichMealPrep(batches)` in `aiService.ts` — new method beside
  `enrichShoppingList`, with Gemini + `MockAiProvider` implementations and a
  `parseEnrichedMealPrepResponse` guard that falls back to the rule-based container map.
- Route `GET /api/nutrition/meal-prep` in `nutritionRoutes.ts`, beside the shopping-list
  route, `preHandler: [requireAuth, requireFeature('meal_planning')]`, same
  `startDate`/`endDate` zod schema.

## Client

- `client/src/components/nutrition/MealPrepDrawer.tsx` — modeled on
  `ShoppingListDrawer.tsx`: same "This week / Next 7 days" presets, print, and share.
- Add a "Meal prep" entry to `PlanActionsMenu.tsx` next to "Shopping list."
- Reuse `printShoppingList` / `shoppingListFormat` utility patterns for a prep-session
  print/share view: batch checklist ("cook 1.75 lb chicken + 5 cups rice → 5 bowls,
  label Mon–Fri"), fresh-adds reminder, reheat notes.

## Phasing

- **Slice 1 (this plan):** ephemeral endpoint + drawer, AI enrichment with fallback,
  cook-ahead/add-fresh split, print/share.
- **Slice 2 (deferred):** `MealPrepSession` model + per-batch check-off state for a
  tracked Sunday-prep ritual; only if slice 1 gets used.
- **Slice 3 (deferred):** manual per-card container/prep notes authored in the meal-card
  editor for card-backed meals, overriding the AI suggestion.

## Ties into existing work

- Reuses [[weekly-plans-architecture]] `PlanPeriod` materialization — meal prep just
  reads whatever `PLANNED` meals the plan already produced.
- Depends on the `Food` badge fields (`role`, `textureTags`, `isFreeFood`) from the
  [[dinner-card-builder]] work for the cook-ahead/add-fresh split.
- Mirrors the shopping-list AI-enrichment + drawer pattern end to end.
