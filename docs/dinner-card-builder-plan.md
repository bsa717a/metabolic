# Dinner Card Builder + Weekly Meal-Plan Lifecycle — Plan

Status: draft (design agreed, not started)
Related: [weekly-plans-plan.md](./weekly-plans-plan.md)

Turns the "Master Metabolic" nutrition vision (Tommy's framework) into a shippable
first slice: a **client self-serve, card-based dinner builder** whose portions scale
per person, delivered inside a **weekly plan lifecycle** (start a program → weekly
plan → weekly check-in advances the plan).

---

## 1. Product decisions (locked)

| Decision | Choice |
|---|---|
| Who drives the card builder | **Client self-serve** |
| Near-term scope | **First slice only**: Phase 0 metadata + dinner-only card builder |
| Card scope | **Dinner (Meal 4) only.** Meals 1–3 are fixed for the week (portioned). |
| Portioning | **One shared card library, portions scaled per user** (not per-band copies) |
| Weekly plan author | **Auto-proposed + coach/user override before it locks** |
| Week advance | **Completing the weekly check-in mints the next week's plan**; skip it and the last plan continues (soft-weekly) |
| Guardrails | **Warn, don't block** when a chosen combo drifts out of the macro band |
| Blood-sugar-stable check | **Role coverage** (protein + fat + carb + veg/fiber present), not fiber grams |

---

## 2. Foundation that already exists (do NOT rebuild)

- **Plan hierarchy:** `NutritionPlanTemplate → NutritionTemplateMeal → NutritionTemplateMealItem → Food` (`schema.prisma:785–839`). Meals carry `mealNumber`/`name`/`plannedTime`.
- **Macro targets + rollups** at template/meal/day level (`AdminNutritionTemplateEditorPage.tsx:18–125`).
- **`Food` master DB** with per-serving macros (`schema.prisma:566`) — the basis for portion scaling.
- **Biometric matching** (gender/height/weight/activity) → per-user template + macro targets (`nutritionTemplateMatch.ts`).
- **Weekly anchor is already live:** `PlanPeriod` (`schema.prisma:~1029`) is created at onboarding (Week 1) and on every apply-template; `planResolution.resolvePlanForDate()` carries a plan forward until the next `PlanPeriod`. `Program.mode` (COACHED/SELF_DIRECTED) exists.
- **Weekly check-in exists** (`VirtualCoachCheckIn`, 8-stage flow, `getWeeklyReview()` stats) — but it is **observational only**; it does not create a `PlanPeriod` or advance the plan.

**Implication:** "one plan lasts a week" is already *semantically* true — it's just not surfaced (UI shows 7 independent days in `WeeklyPlanner.tsx`), nothing rotates the weekly plan, and the check-in doesn't advance it. This plan finishes that loop and adds the dinner card layer.

---

## 3. The weekly-program lifecycle (target)

```
START A PROGRAM  (onboarding, existing)
   └─ create Program + PlanPeriod #1  = "Week 1 plan"
        ├─ Meals 1–3: fixed template meals, portioned to this user's macro target
        └─ Meal 4 (dinner): a MealCardSet — chosen daily via the card builder

EACH DAY of the week
   └─ dailyLogService renders the day from the active PlanPeriod:
        ├─ Meals 1–3 identical across the 7 days (the weekly plan)
        └─ Dinner = card builder: defaults render valid, client swaps options,
           portions scale to their target, save materializes into the day's Meal

WEEKLY CHECK-IN  (VirtualCoachCheckIn, existing 8-stage flow)
   └─ on COMPLETE:  propose next week's plan (auto) → coach/user may override →
        create PlanPeriod #N+1 (effectiveDate = next week start)
        ├─ Meals 1–3 rotated (feel different from prior weeks)
        └─ dinner MealCardSet (same or rotated)
   └─ skip the check-in → no new PlanPeriod → last week's plan continues
```

A `PlanPeriod` **is** the week's plan. `weekNumber` on `PlanPeriod` gives the "Week N"
framing to surface in the UI.

---

## 4. Data model

### 4a. Phase 0 — composition metadata (trimmed to badge-essentials)

On `Food` (`schema.prisma:566`), add only what the live badges consume:

```prisma
enum MealCardRole { PROTEIN FAT CARB VEGETABLE FRUIT FREE }

model Food {
  // ...existing (name, servingSize, servingUnit, calories, protein, carbs, fat, fiber ...)
  role         MealCardRole?          // for role-coverage / blood-sugar-stable check
  flavorTags   String[]               // Postgres scalar list (confirm DB); else FoodTag join
  textureTags  String[]
  isFreeFood   Boolean @default(false)
  cardOptionFoods MealCardOptionFood[]   // back-relation
}
```

Deferred to later phases: `organic` / `seedOilFree` (no badge reads them yet).

Seed a curated **free-foods list** (salsa, pico, mustard, hot sauce, herbs, pickles,
vinegars) as `Food` rows with `isFreeFood = true`. **Tag only the ~40 foods used in the
seeded dinner card sets** — full-library tagging is a later batch job (AI-assisted).

### 4b. Shared card library — decoupled from any biometric template

The library references `Food` **live** and stores a **scalable base portion**, not a
frozen macro snapshot. Macros are derived (`Food` per-serving × servings). One card set
serves every biometric band; only the portions differ.

```prisma
enum MealSlotType { BREAKFAST SNACK LUNCH DINNER }

model MealCardSet {
  id                String        @id @default(cuid())
  name              String
  slotType          MealSlotType  @default(DINNER)
  visibility        Visibility    @default(USER)   // reuse existing GLOBAL/USER enum
  createdById       String?
  // portions authored against this reference target; the scaling denominator
  referenceCalories Int
  referenceProtein  Int?
  referenceCarbs    Int?
  referenceFat      Int?
  cards             MealCard[]
  templateMeals     NutritionTemplateMeal[]        // many templates → one card set
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}

model MealCard {
  id         String           @id @default(cuid())
  cardSetId  String
  cardSet    MealCardSet      @relation(fields: [cardSetId], references: [id], onDelete: Cascade)
  role       MealCardRole
  name       String
  sortOrder  Int              @default(0)
  required   Boolean          @default(true)
  maxSelect  Int              @default(1)          // >1 → multi-select (free foods)
  options    MealCardOption[]
  @@unique([cardSetId, sortOrder])
}

model MealCardOption {
  id        String               @id @default(cuid())
  cardId    String
  card      MealCard             @relation(fields: [cardId], references: [id], onDelete: Cascade)
  name      String
  cuisine   String?
  isDefault Boolean              @default(false)
  sortOrder Int                  @default(0)
  foods     MealCardOptionFood[]
}

// The scalable line — references Food LIVE, no frozen macro snapshot
model MealCardOptionFood {
  id           String         @id @default(cuid())
  optionId     String
  option       MealCardOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  foodId       String
  food         Food           @relation(fields: [foodId], references: [id])
  baseServings Float          // servings at the set's reference target
  scalable     Boolean        @default(true)   // false = garnish/free (fixed amount)
  discrete     Boolean        @default(false)  // true = round to whole units (tortillas, eggs)
  unitStep     Float          @default(1)      // rounding step when discrete
  minServings  Float?                          // clamp floor
  maxServings  Float?                          // clamp ceiling
}
```

### 4c. Modified existing models (additive, nullable — nothing breaks)

```prisma
model NutritionTemplateMeal {   // schema.prisma:811 — link Meal 4 to its card set
  // ...existing...
  mealCardSetId String?
  mealCardSet   MealCardSet? @relation(fields: [mealCardSetId], references: [id])
}

model Meal {                    // schema.prisma:521 — the day's log
  // ...existing...
  cardSelections Json?   // { [cardId]: optionId | optionId[], resolvedServings: {...} }
}
```

Existing single-list dinners keep working; card sets are **opt-in** per template meal.
No data backfill required — just seed one dinner card set for the demo.

---

## 5. Portion scaling resolver

Runs at serve-time when the client opens dinner:

1. Resolve the client's active plan for the date via `resolvePlanForDate()` → the week's
   nutrition template → its dinner meal → `mealCardSetId`.
2. Compute the client's **dinner macro target** from the template's targets.
3. **Scale factor:**
   - *Slice (ship first):* one calorie factor = `clientDinnerCalories / cardSet.referenceCalories`.
   - *Full (ship second):* per-role factor = `clientTarget[role] / referenceContribution[role]`
     — lets one set hit different macro **ratios**, not just totals.
4. Per line: `servings = scalable ? baseServings × factor : baseServings`; if `discrete`,
   round to `unitStep`; clamp to `[minServings, maxServings]`.
5. Macros = `food per-serving × servings` (derived, live).

**Worked example** — reference set authored at 660 kcal; female (480 kcal) factor ≈ 0.73:

| Line | baseServings | Male ×1.0 | Female ×0.73 |
|---|---|---|---|
| Ground beef (2 oz/srv) | 3 | 6 oz | ~4.4 oz |
| Rice (1 cup/srv) | 1 | 1 cup | ~¾ cup |
| Tortilla (discrete, step 1) | 3 | 3 | round(2.18) = 2 |
| Salsa (`scalable=false`) | 1 | fixed | fixed |

**On save:** `POST /api/daily-logs/:date/dinner/selections` writes `cardSelections` JSON on
the day's `Meal`, then materializes each selected option's foods into `MealItem`
(`type: PLANNED`) with the **computed** quantity + macros frozen in — reusing the existing
apply-template write path (`nutritionRoutes.ts:~189`). Logs stay historically accurate.

---

## 6. Workstreams & difficulty

Difficulty: **S** ≈ 1–2 days · **M** ≈ ~1 wk · **L** ≈ 2–3 wks · **XL** ≈ month+.

| # | Workstream | What | Difficulty |
|---|---|---|---|
| A | Phase 0 metadata | `Food` role/tags/isFreeFood + migration + free-foods seed + tag ~40 foods | **M** |
| B | Card-library schema | MealCardSet/Card/Option/OptionFood + `mealCardSetId` + `Meal.cardSelections` + migration | **L** |
| C | Seed dinner card sets | Script (backfill pattern) authoring 2–3 real dinner sets — **replaces an authoring UI for the slice** | **S–M** |
| D-api | Client dinner endpoints | `GET dinner/cards` (resolve plan → card set → scale) + `POST dinner/selections` (persist + materialize) | **M** |
| D-ui | Client card-builder UI | Card grid, option swap, free-foods multi-select, live badges (stable / in-range / flavor+texture) | **L** |
| E | Weekly surfacing | Present the active `PlanPeriod` as "Week N plan" (Meals 1–3 fixed + daily dinner), not 7 independent days | **M** |
| F | Check-in advances plan | On `VirtualCoachCheckIn` complete: propose next week's plan (auto) → coach/user override → create next `PlanPeriod` | **L** |

Authoring UI for card sets, per-role scaling refinement, full-library tagging, and
Meals-1–3 weekly rotation intelligence are **deferred beyond the slice**.

### Build order

1. **A → B** (schema gate; everything depends on it).
2. **C** seed real dinner sets so there's content.
3. **D-api** and **D-ui** in parallel (contract-first: freeze the `dinner/cards` JSON, mock the UI against it). Badges are pure client-side derivations of that payload — no badge endpoints.
4. **E** surface the weekly plan framing.
5. **F** wire check-in completion → next `PlanPeriod` (closes the weekly loop).

Slice total after cuts (defer authoring UI, tag only seeded foods, JSON selection, client-side badges): ~**M–L** (roughly 2–3 focused weeks), parallelizable.

---

## 7. Open decisions / risks

- **DB confirm:** Postgres scalar `String[]` for tags, or a `FoodTag` join table? (Affects A only.)
- **Auto-propose depth for Workstream F:** slice version can reuse the matched template + attach a dinner card set (minimal "rotation"); real Meals-1–3 rotation/fatigue-avoidance is a later phase.
- **Override UX:** where coach/user tweaks the proposed next-week plan before it locks (new surface — scope in F).
- **Dinner default at day render:** when `dailyLogService` materializes a day, render Meal 4 from the card set's default options (so a valid dinner always exists) and mark it client-editable.
- **Self-directed (log-only) users:** do they get the dinner builder too, or is it coached-only for the slice? (Default: available to both once a plan/card set is assigned.)
```
