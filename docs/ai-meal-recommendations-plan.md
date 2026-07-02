# AI Meal Recommendations in the Meal Builder — Plan

Status: draft (decisions locked, not started)
Related: [dinner-card-builder-plan.md](./dinner-card-builder-plan.md)

Adds a fast path to the meal builder: instead of stepping through protein → carb →
veggies, the user taps **✨ Recommend meals** and gets **4–5 complete, free-form AI
meals** that fit that meal slot's calorie/protein target. Tap one → review → save,
with the same rest-of-week behavior as a card build.

---

## 1. Decisions (locked)

| Decision | Choice |
|---|---|
| Meal source | **Free-form AI** — meals invented from scratch, not limited to the card library |
| Steering | **Optional craving box** ("something spicy", "no fish tonight"); one tap works without it |
| Dietary safety | **Pull from profile**: `ClientProfile.foodConditions` (allergies) + `dietNotes` (preferences) — already exist and are already fed to AI context by `assistantService` |
| Placement | An option **beside** the wizard, not replacing it |

## 2. What already exists (reuse, don't rebuild)

- **`AiProvider.suggestMealOptions(input, context)`** (`aiService.ts:153`) — returns
  `{ intro, options: [{ name, description, calories, protein, carbs, fat }] }`.
  Already prompted with profile allergies/preferences and day targets via
  `assistantService.suggestMealOptions` (`assistantService.ts:180`). **Missing: items.**
- **AI-food creation pattern** — `foodLookupService.acceptFoodLookup` creates `Food`
  rows (`aiGenerated: true`, visibility USER) from AI estimates. Same pattern for
  recommendation items.
- **Meal targets** — `NutritionTemplateMeal.calorieTarget` (per-slot scale numerator
  from the card work) tells the AI exactly what to fit.
- **Materialization + totals** — PLANNED-item replacement, `recalculateMealTotals`,
  `recalculateDailyLogTotals` (mealCardMaterialize/totalsService).
- **Rest-of-week propagation** — the pattern from `applyPicksToFutureLogs`
  (existing future logs) + prior-day copy for new days.
- **MockAiProvider** — deterministic test path without live Gemini calls.

## 3. Workstreams

### A. Provider: itemized meal suggestions (M)
New `AiProvider.suggestItemizedMeals(input, context): Promise<ItemizedMealSuggestion[]>`
(Gemini + mock). Each option:

```ts
{
  name: string;            // "Smoky Chicken Fajita Bowl"
  description: string;     // one appetizing sentence
  items: Array<{
    name: string;          // "Grilled chicken breast"
    quantity: number; unit: string;
    calories: number; protein: number; carbs: number; fat: number;
    role: 'PROTEIN'|'CARB'|'VEGETABLE'|'FAT'|'FRUIT'|'FREE';  // powers the badges
  }>;
}
```

Prompt contract: fit `targetCalories` ±10%, protein-forward, 4–5 diverse options,
role coverage (protein+carb+veg) unless the craving says otherwise, **hard rule:
never include profile allergens**, respect dietary preferences, avoid the user's
recent meals (variety). Zod-validate; drop options whose item sums drift >20% from
their claimed totals.

### B. Recommendation service + GET endpoint (M)
`mealRecommendationService.recommendMeals(userId, date, mealNumber, craving?)`:
resolve the plan → template meal target + slot type; load profile conditions,
recent meal names (last ~5 days, that slot) for variety; call provider; annotate
each option server-side with `withinBand` / `bloodSugarStable` (same warn-not-block
math as the builder). Route: `GET /api/daily-logs/:date/meal-recommendations?mealNumber=N&craving=...`.
AI latency is seconds — the client shows a loading state; no caching in the slice
(each tap is a fresh call; "show me different ones" = same endpoint again).

### C. Save path + week propagation (M)
`POST /api/daily-logs/:date/meal-recommendation` with `{ mealNumber, suggestion }`
(client round-trips the chosen option; server re-validates with the same zod schema
and macro-drift check):
1. Upsert `Food` rows per item — dedup by name against GLOBAL + the user's own foods,
   else create (`aiGenerated: true`, `role` from the item) — the acceptFoodLookup pattern.
2. Replace the meal's PLANNED items (ACTUAL never touched), set the meal's display
   name to the suggestion name, stamp provenance
   (`Meal.cardSelections = { aiMeal: { name, savedAt } }` — reusing the JSON column;
   a card build later simply overwrites it).
3. Recalc totals; **forward-apply items** to existing future days' same-numbered meal
   (14-day horizon, skip days with ACTUAL items) — mirrors the card-picks rule
   "building a meal sets it for that day forward". New days inherit via the existing
   prior-day copy. Note: an AI meal does NOT update `UserMealCardPicks` (those are
   card-space); reopening the wizard shows card defaults, which is correct.

### D. Client UI (M–L)
Builder opens with a **path chooser** (replaces jumping straight into step 1):
"✨ Recommend meals for me" / "Build it myself →". Recommend screen: craving box +
Go, skeleton loading state, then 4–5 meal cards (name, description, item list with
portions, kcal + protein vs target, badges), "Show me different ones", tap → confirm
sheet (item checklist + badges, same visual grammar as the review step) → "Add to
plan". Errors (AI down/slow) fall back gracefully to the wizard path.

### E. Tests (S–M)
Zod/validation unit tests (drift rejection, allergen echo-check), service tests with
MockAiProvider, e2e smoke: recommend → save → items materialized + propagated.

**Build order:** A → B → C in one server pass (contract-first: freeze the suggestion
JSON), then D against the frozen contract, E throughout. Rough total: ~1 focused week.

## 4. Risks / notes

- **Allergy safety is best-effort.** Free-text `foodConditions` + LLM = strong prompt
  rule, not a guarantee. Mitigations: allergen terms re-checked server-side against
  item names (simple substring pass, drop violating options), and a one-line
  disclaimer on the recommend screen. Do not ship without both.
- **AI macros are estimates.** Same trust level as the existing SMS food lookup —
  acceptable and consistent; the drift check bounds the damage.
- **Food-table growth.** AI creates USER-visibility food rows; name-dedup keeps a
  lid on it. A cleanup/merge job is a later concern.
- **Tommy's structure is bypassed** by design (free-form choice). Role tags + the
  stability badge keep the blood-sugar framing visible even for AI meals.
- **Cost:** one Gemini call per recommend tap. Fine at current scale; revisit
  caching if usage spikes.

## 5. Open questions (defaults chosen, flag if wrong)

- Recommendations available to **both** coached and self-directed-with-plan users
  (anyone with a meal target). Users with no plan: hidden (no target to fit).
- The craving box also accepts exclusions ("no dairy today") — same field, the
  prompt handles both.
- Suggestion cards show **no photos** in the slice (AI meals have no imageUrl);
  emoji-by-role tiles keep the visual language.
