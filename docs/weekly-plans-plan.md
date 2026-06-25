# Weekly plans + log-only mode — implementation plan

Branch: `fix/week-plans`. Status: design + validated retrofit; schema not yet written.

## Problem

The app was built **program-centric and daily**. The source app (astermet / `mmv1`) was
**weekly**: a coach met the client each week (a "session"), recorded measurements, and assigned a
plan for the coming week. Two capabilities are missing:

- **Gap A — "just log food" with no plan.** Today, food logging *requires* an active `Program`.
  `ensureDailyLogByUserId` (`dailyLogService.ts:221`) returns `null` with no program, and
  `resolveTargetMeal` (`smsIntentService.ts:509`) then throws *"No active program found for today."*
- **Gap B — weekly plan structure.** A `Program` references **one** `defaultNutritionTemplate`
  applied uniformly to every day. There is no per-week plan, no plan history, and no structural
  home for the weekly session.

Neither is a rewrite. Both are additive layers over a schema that is already well-shaped.

## Gap A — log-only mode (self-directed program)

Do **not** decouple `DailyLog`/`Meal` from `Program` (that FK is load-bearing across dashboard, SMS,
gamification). Instead give log-only users a lightweight program — "a program for tracking food."

- Add `Program.mode` enum: `SELF_DIRECTED` | `COACHED` (default `COACHED` for existing rows).
- `SELF_DIRECTED` = no coach, `defaultNutritionTemplateId = null`. Days fall back to
  copy-yesterday / default meals (already supported in `ensureDailyLog`).
- At the `if (!program)` seam, **provision** a self-directed program instead of throwing, so all
  existing logging/dashboard/SMS handlers work unchanged.

**Open decision (targets):** with no coach/plan, where do calorie/protein targets come from?
(a) user sets their own goals, (b) computed from profile/TDEE, (c) none — pure logging/totals.
This decides whether we add user-level goal fields.

## Gap B — weekly plan layer (attach plan to the session snapshot)

The "session snapshot" on the Metabolic Blueprint page (`ProgramPage.tsx` →
`/api/programs/:id/metric-snapshots`) **is** `ProgramMetricSnapshot` — a dated, intended-weekly
measurement capture, already optionally linked from `CoachSession.linkedSnapshotId`. This is the
existing weekly anchor; hang the plan off it rather than inventing a parallel calendar.

- A snapshot becomes a **plan epoch boundary**. Attach `nutritionTemplateId?` / `exerciseTemplateId?`
  to the snapshot **or** a small dedicated `PlanPeriod` record linked to it (open decision below).
- Add one helper: `resolveTemplateForDate(program, date)` → "the most recent session snapshot on/
  before `date` that has a plan → its template; else `program.defaultNutritionTemplate`." Point
  `ensureDailyLog`'s template-application path and the coach "apply template" endpoint at it.
- **"Week" = snapshot-to-snapshot.** A late or skipped session never breaks anything — the current
  plan simply continues until the next snapshot sets a new one.
- **Soft enforcement only.** Weekly is a *target*: reuse the existing `WEEKLY_SNAPSHOT` streak and
  SMS nudges ("it's been 7+ days, time for a check-in"). The blueprint page shows "Week N · due for
  a session" by counting days since the last snapshot. **No hard gates** that block logging/plan.

**Open decisions:**
1. Plan attaches **directly on `ProgramMetricSnapshot`** (two nullable columns, simplest) vs a
   dedicated **`PlanPeriod`** record linked to the snapshot (keeps measurements vs plan-assignment
   separate; slightly more plumbing). Lean: dedicated record.
2. Weekly anchor = `ProgramMetricSnapshot` (where the migrated data already is) vs `CoachSession`
   (cleaner semantically, but empty from import — would need backfill).

## Retrofit — restore weekly structure for migrated clients

The legacy import (report: `server/.tmp/migration-report.md`) split each weekly session in two and
dropped the link. **Validated against the dump** that this is cheaply recoverable *in-database*:

### Validated findings (from `astermet_app.sql`, parser counts exact: 8759 / 8611 / 5421)

| Check | Result |
|---|---|
| Real plan→session join: `plan.owner_id` → `training_sessions.id` | nutrition **97.9%**, exercise **99.2%** |
| Plans per session | **8,388 sessions = exactly 1** nutrition plan (one plan : one week) |
| `session_number` ordering | clean `1,2,3…` by date per user |
| Session cadence | median gap **7 days**; 50% exactly 7; 68% within 6–8; mean 10.9 (long tails) |
| Sessions with no plan | ~353 (measurement-only check-ins) |
| Plans dropped at import | ~2% (184 nutrition, 46 exercise) — unrecoverable, not worth chasing |

### Why the retrofit is an in-DB backfill (not a dump re-parse)

Migration phases 3 (`03-progress.ts:27,182`) and 4 (`04-daily-plans.ts`) **both dated their rows by
the same `training_sessions.date`** (UTC midnight, same created_at fallback, deduped to one per
calendar day). So in Postgres, every weekly session already exists as **a `ProgramMetricSnapshot`
*and* a `DailyLog` sharing `(userId, date)`**. Therefore:

- **Session ↔ plan link** = join `ProgramMetricSnapshot` ↔ `DailyLog` on `(userId, date)`.
- **Week number** = rank a user's snapshots by date (validated to match legacy `session_number`).

The 64MB dump is now only a cross-check, not a dependency. The `idmap` files lack any session/
snapshot/log breadcrumb, which is why this date-coincidence is the join key.

### Backfill steps

1. Schema delta for Gap B is in place (snapshot↔plan, or `PlanPeriod`).
2. For each program: order `ProgramMetricSnapshot`s by date → assign `weekNumber`.
3. For each snapshot, find the `DailyLog` at the same `(userId, date)`; treat that log's planned
   meals as the plan for that week (or link the template if we reverse-map meals → template).
4. Snapshots with no matching daily log = measurement-only weeks (no plan; plan carries over).

Read-only validator: `server/scripts/weekly-plan-backfill.ts` (dry-run by default; reports join
coverage + week numbering against a live DB before any writes).

**Live-DB validation (read-only run against the migrated dataset, 8,491 snapshots):**
**8,189 / 8,190 legacy daily logs (100.0%)** join to a metric snapshot on `(userId, date)`; 96.5%
of snapshots have a matching log (294 = 3.5% measurement-only weeks). Confirms the in-DB join is
sound on real data — the retrofit needs no legacy dump.

## Phasing

1. **Gap A**: `Program.mode` + self-directed provisioning + (targets decision). Ships independently.
2. **Gap B schema**: snapshot↔plan / `PlanPeriod` + `resolveTemplateForDate`. Old programs keep
   working via fallback.
3. **Retrofit backfill**: in-DB, idempotent; reproduces current behavior, then enables per-week edits.
4. **UX/API**: onboarding mode choice, coach weekly-plan management, weekly-session flow, mode switch.

## Decisions (resolved)

- **Targets for log-only users:** captured at onboarding, stored via the existing `ProgramMetric`
  mechanism (no new schema). A self-directed program just gets calorie/protein goals like a coached
  one; `DailyLog` seeds daily targets from them.
- **Plan attachment:** dedicated **`PlanPeriod`** record (not columns on `ProgramMetricSnapshot`).
- **Weekly anchor:** `PlanPeriod` is the anchor for *plans*; `ProgramMetricSnapshot` stays
  measurements-only; `CoachSession` stays the meeting and references both. No `CoachSession` backfill.

Still open: retrofit scope (ACTIVE only vs also COMPLETED/ARCHIVED); mode-switching UX (assumed
both directions).

## Schema deltas (drafted in `prisma/schema.prisma`; migration not yet generated)

```prisma
enum ProgramMode { COACHED  SELF_DIRECTED }

// Program: + mode ProgramMode @default(COACHED)   + planPeriods PlanPeriod[]

model PlanPeriod {
  id String @id @default(cuid())
  programId String
  effectiveDate DateTime           // plan applies from here until the next PlanPeriod
  weekNumber Int?                  // display/history; retrofit fills from date rank
  nutritionTemplateId String?      // null = carry forward / fall back to Program default
  exerciseTemplateId String?
  coachSessionId String? @unique   // the meeting that set it (optional)
  sourceSnapshotId String?         // measurements taken when set (optional)
  notes String?
  createdById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // + relations to Program (Cascade), NutritionPlanTemplate/ExerciseTemplate/CoachSession/
  //   ProgramMetricSnapshot/User (all SetNull)
  @@unique([programId, effectiveDate])
  @@index([programId, effectiveDate])
}
```

Back-relations added to `Program`, `NutritionPlanTemplate`, `ExerciseTemplate`, `CoachSession`
(`planPeriod PlanPeriod?`), `ProgramMetricSnapshot`, `User` (`PlanPeriodCreator`). Schema passes
`prisma validate`; client regenerated.

**Generate the migration (on a dev DB — NOT prod; `server/.env` appears to point at the live DB):**

```bash
# point DATABASE_URL at a scratch/dev Postgres first
cd server && npx prisma migrate dev --name weekly_plans
```

Expected SQL (hand-authored stub for review — let `migrate dev` generate the real one):

```sql
CREATE TYPE "ProgramMode" AS ENUM ('COACHED', 'SELF_DIRECTED');
ALTER TABLE "Program" ADD COLUMN "mode" "ProgramMode" NOT NULL DEFAULT 'COACHED';
CREATE TABLE "PlanPeriod" (
  "id" TEXT PRIMARY KEY, "programId" TEXT NOT NULL, "effectiveDate" TIMESTAMP(3) NOT NULL,
  "weekNumber" INTEGER, "nutritionTemplateId" TEXT, "exerciseTemplateId" TEXT,
  "coachSessionId" TEXT, "sourceSnapshotId" TEXT, "notes" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PlanPeriod_coachSessionId_key" ON "PlanPeriod"("coachSessionId");
CREATE UNIQUE INDEX "PlanPeriod_programId_effectiveDate_key" ON "PlanPeriod"("programId","effectiveDate");
CREATE INDEX "PlanPeriod_programId_effectiveDate_idx" ON "PlanPeriod"("programId","effectiveDate");
-- + 6 FKs (program Cascade; nutrition/exercise template, coachSession, sourceSnapshot, createdBy SetNull)
```

## Resolver (drafted: `src/services/planResolution.ts`)

```ts
resolvePlanForDate(program, date, db?) -> { planPeriodId, nutritionTemplateId, exerciseTemplateId }
```

Latest `PlanPeriod` on/before `date`; carries each template type forward independently; falls back
to `program.default*TemplateId`. **Not yet wired in** — integration points: `ensureDailyLog`'s
template-application branch (`dailyLogService.ts`) and the coach apply-template endpoint.

## Write-backfill outline

The fallback means **existing coached programs keep working with no backfill** (default template).
Backfill is purely to restore week history + enable per-week edits:

1. `Program.mode` stays `COACHED` for all migrated programs (default); self-directed is set only by
   the new log-only provisioning path.
2. Per program: load `ProgramMetricSnapshot`s ordered by date → for each, upsert a `PlanPeriod`
   (`effectiveDate = snapshot.date`, `weekNumber = rank`, `sourceSnapshotId = snapshot.id`,
   templates `null` — legacy weeks were inline plans already materialized as `DailyLog` meals).
   Idempotent on `(programId, effectiveDate)`.
3. Optional: create a `PlanPeriod` at "today" pointing at `program.defaultNutritionTemplateId` so
   future-day generation flows through `PlanPeriod` explicitly (else the default fallback covers it).
4. Validate first with `server/scripts/weekly-plan-backfill.ts` (read-only). The write path will be
   added behind an `--apply` flag once schema is migrated on a real target.
