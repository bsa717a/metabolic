# Formula-Computed Targets with Nutritionist Override Bands — Plan

Status: draft (decisions locked, not started)
Related: [dinner-card-builder-plan.md](./dinner-card-builder-plan.md), [ai-meal-recommendations-plan.md](./ai-meal-recommendations-plan.md)

Separates the two jobs the 61 band templates currently do badly together: **food**
(now fully owned by the card system) and **targets** (moving to a computed formula
with nutritionist oversight). Fixes the measured coverage gap (~⅓ of active clients
fall outside today's bands; activity level is dead weight — every band spans 1–5).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Food source | **Card system only.** Plans carry no food; no-picks days materialize from card DEFAULT options scaled to slot targets |
| Target source | **Computed formula** (Mifflin-St Jeor BMR × activity − deficit; protein by body weight; macro split), constants tunable by Tommy |
| Nutritionist control | **Override bands**: criteria (gender + height/weight/activity ranges) → pinned targets; most-specific wins over formula. Tommy can also tune formula constants |
| Resolution order | Coach pin (per client) → Tommy override band → formula |
| Migration | **Convert the 61 templates' targets into initial override bands** — every current user keeps their exact numbers; Tommy retires overrides at his own pace via the review grid |
| Approval model | **Live formula + review dashboard** (warn-not-block) — no waiting on sign-off |
| Weekly flow | Check-in recomputes from current weight and **freezes the week's numbers on the PlanPeriod** (plan history = numbers per week). Band-hysteresis becomes unnecessary |

## Schema (additive)

- `TargetOverrideBand`: gender, heightMin/MaxInches, weightMin/MaxLbs, activityMin/Max,
  calorieTarget/proteinTarget/carbTarget/fatTarget, notes, createdById, timestamps.
  Same criteria shape as `nutritionTemplateMatch` — reuse its predicates/specificity.
- `PlanPeriod`: nullable calorieTarget/proteinTarget/carbTarget/fatTarget + `targetSource`
  ('FORMULA' | 'OVERRIDE_BAND' | 'COACH' | 'TEMPLATE') — the frozen weekly numbers.
- `Program`: nullable pinned target columns (coach per-client pin).
- Formula constants + meal-slot structure as JSON in `AppSetting`
  (keys `targetFormula`, `mealStructure`), zod-validated:
  - targetFormula: activityMultipliers[1..5], deficitPct, proteinPerLb, carbPct/fatPct, calorieFloor (safety).
  - mealStructure: slots [{ mealNumber, name, plannedTime, sharePct, slotType }] — ONE
    canonical structure replacing 61 copies of the same six meals.

## Services

1. **`targetService.ts`** (new): `computeFormulaTargets(profile, config)` (pure, unit-tested);
   `resolveTargets(userId)` → { calories, protein, carbs, fat, source } walking
   coach pin → override band (reuse `templateMatchesProfile`-style predicates +
   specificity tie-break) → formula; `slotTargets(targets, structure)`.
2. **planAdvancement**: on mint/advance, resolve targets from the CURRENT weight and
   freeze onto the PlanPeriod. `resolvePlanForDate` gains target awareness: periods
   with frozen targets are the source; legacy periods fall back to their template.
3. **Materialization**: extend `mealCardMaterialize` with `defaultPicksForSet(cardSet)`
   (isDefault options); new-day creation for target-based plans builds each slot from
   standing picks → else card defaults → scaled to the slot's share of the frozen
   day target. `applyTemplateMealsToLog` remains only for legacy/coach-custom template periods.
4. **mealCardService / mealRecommendationService**: slot target resolution order becomes
   PlanPeriod-frozen targets × structure share → legacy templateMeal.calorieTarget → cardSet reference.
5. **Onboarding / self-serve adoption / plan-status**: use `resolveTargets` — no template
   match required; `plan-proposal` previews the formula (or matched override band) numbers.
   `coached_no_plan` state effectively disappears for complete profiles.
6. **Conversion script** (`scripts/convert-bands-to-overrides.ts`, dry-run default):
   61 global templates → `TargetOverrideBand` rows (criteria + targets, note
   'Converted from template <name>'). Global templates stop being matched/applied;
   rows stay in DB for legacy PlanPeriod references. Coach-authored USER templates untouched.

## Admin UI — the "Targets" page (Tommy's oversight)

- **Formula panel**: the constants, editable, with a live example profile preview.
- **Override bands table**: CRUD, same band-editing UX as template criteria today.
- **Population grid**: segments (gender × height bucket × weight bucket) showing
  # of active clients, formula targets for a representative profile, and any
  override in effect — computed-vs-pinned side by side. This doubles as the
  coverage report; nobody can silently fall outside the system again because the
  formula is total.

## Stages (each shippable)

1. **Foundation**: schema + targetService + formula config + conversion script (dry-run
   verified against the 61 templates; applying changes nothing user-visible yet). Unit
   tests: formula math, resolution order, specificity.
2. **Wire targets**: check-in advancement freezes numbers; onboarding/adoption/plan-status
   read resolveTargets; PlanPeriod-frozen targets drive DailyLog stamping + banner.
   Legacy template periods keep working via fallback.
3. **Food decouple**: card-defaults materialization + mealStructure config; slot targets
   from frozen day targets. Template food no longer materialized for target-based plans.
4. **Tommy's page**: admin Targets page (formula panel, override CRUD, population grid).
5. **Cleanup**: retire global-template authoring surfaces; per-meal calorieTarget on
   NutritionTemplateMeal becomes legacy-only.

## Verification

- Unit: formula against hand-computed profiles (both genders, activity 1/3/5, floor
  clamp); override specificity; slot splitting sums to day target.
- Conversion: dry-run diff — every currently-matched user resolves to IDENTICAL targets
  via their converted override band (this is the continuity guarantee).
- E2E (mock provider): fresh user w/ complete profile + NO override match → formula
  targets on Week 1 PlanPeriod → day materialized from card defaults at those targets;
  check-in after weight change → next period's numbers move accordingly.
- Population report before/after: matched coverage goes from ~0% (activity nulls) /
  ~66% (band gaps) to 100% of complete profiles.

## Open items (defaults chosen)

- Activity-null users: formula needs activity — default to 2 ("lightly active") when
  null rather than blocking; the profile prompt nudges them to set it.
- Protein for very heavy clients: proteinPerLb × lean-ish adjustment is a Tommy
  formula-constant question; ship with simple g/lb + floor/ceiling, he tunes.
- Carb/fat split fixed percentages initially; per-band override rows can vary them.
