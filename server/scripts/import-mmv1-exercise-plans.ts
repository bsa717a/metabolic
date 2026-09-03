/**
 * Import mmv1 `exerciseTemplate` rows as Metabolic ExercisePlan + day ExerciseTemplates.
 *
 * Legacy shape: each SQL row is a named week plan; `circuittemplate` JSON has
 * `circuit[]` where each circuit is one day/routine.
 *
 * Dry-run by default:
 *   cd server && npx tsx --env-file=.env scripts/import-mmv1-exercise-plans.ts
 *   cd server && npx tsx --env-file=.env scripts/import-mmv1-exercise-plans.ts --apply
 *   cd server && npx tsx --env-file=.env scripts/import-mmv1-exercise-plans.ts --sql ../mmv1/mmv1/astermet_app.sql --apply
 *
 * Re-runnable: plans tagged with `mmv1:exerciseTemplate:{id}` in description are
 * replaced (days deleted + recreated). Pass `--wipe-imported` to delete those plans
 * first without recreating (dry-run still reports).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, Visibility } from '@prisma/client';

const prisma = new PrismaClient();

const MMV1_TAG_PREFIX = 'mmv1:exerciseTemplate:';

type LegacyCircuitItem = {
  name?: string;
  category?: string;
  sets?: string | number;
  reps?: string | number;
  weight?: string | number;
  lcount?: number;
};

type LegacyCircuit = {
  circuitnum?: number;
  name?: string;
  items?: LegacyCircuitItem[];
  notes?: string;
};

type LegacyPlan = {
  legacyId: number;
  name: string;
  programNotes: string;
  circuits: LegacyCircuit[];
};

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Unescape mysqldump string literals (handles \", \', \\, \\n, etc.). */
function unescapeSqlString(value: string) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '\\' && i + 1 < value.length) {
      const next = value[i + 1];
      if (next === '"' || next === "'" || next === '\\') {
        out += next;
        i += 1;
        continue;
      }
      if (next === 'n') {
        out += '\n';
        i += 1;
        continue;
      }
      if (next === 'r') {
        out += '\r';
        i += 1;
        continue;
      }
      if (next === 't') {
        out += '\t';
        i += 1;
        continue;
      }
    }
    out += value[i];
  }
  return out;
}

function parseIntLoose(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseDurationSeconds(reps: unknown): number | null {
  if (typeof reps !== 'string') return null;
  const lower = reps.toLowerCase();
  const sec = lower.match(/(\d+)\s*sec/);
  if (sec) return Math.max(1, Number(sec[1]));
  const min = lower.match(/(\d+)\s*min/);
  if (min) return Number(min[1]) * 60;
  return null;
}

function mmv1Tag(legacyId: number) {
  return `${MMV1_TAG_PREFIX}${legacyId}`;
}

function parseExerciseTemplateInsert(sql: string): LegacyPlan[] {
  const marker = 'INSERT INTO `exerciseTemplate`';
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error('Could not find INSERT INTO `exerciseTemplate` in SQL dump');

  const nextTable = sql.indexOf('\n-- --------------------------------------------------------', start + marker.length);
  const chunk = nextTable === -1 ? sql.slice(start) : sql.slice(start, nextTable);

  const plans: LegacyPlan[] = [];
  // Row shape: (id, 'name', 'program_notes', 'circuittemplate', 'created', 'updated')
  const rowRe =
    /\((\d+),\s*'((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)',\s*'((?:\\'|[^'])*)',\s*'[^']*',\s*'[^']*'\)/g;

  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(chunk))) {
    const legacyId = Number(match[1]);
    const name = unescapeSqlString(match[2]).trim();
    const programNotes = unescapeSqlString(match[3]).trim();
    const circuitRaw = unescapeSqlString(match[4]);
    let parsed: { circuit?: LegacyCircuit[] };
    try {
      parsed = JSON.parse(circuitRaw) as { circuit?: LegacyCircuit[] };
    } catch (error) {
      console.warn(`Skip legacy #${legacyId} (${name}): invalid circuit JSON — ${error}`);
      continue;
    }
    const circuits = Array.isArray(parsed.circuit) ? parsed.circuit : [];
    if (!circuits.length) {
      console.warn(`Skip legacy #${legacyId} (${name}): no circuits`);
      continue;
    }
    plans.push({ legacyId, name, programNotes, circuits });
  }

  return plans;
}

async function resolveExerciseId(
  name: string,
  category: string | undefined,
  cache: Map<string, string>,
  createMissing: boolean
) {
  const key = normalizeName(name);
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await prisma.exercise.findFirst({
    where: { name: { equals: name.trim(), mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  if (!createMissing) return null;

  const created = await prisma.exercise.create({
    data: {
      name: name.trim(),
      category: category?.trim() || null
    },
    select: { id: true }
  });
  cache.set(key, created.id);
  return created.id;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const wipeImported = process.argv.includes('--wipe-imported');
  const createMissingExercises = !process.argv.includes('--no-create-exercises');
  const sqlPath = resolve(
    readArg('--sql') ?? '/Users/derekfowler/repo/mmv1/mmv1/astermet_app.sql'
  );

  console.log(`SQL: ${sqlPath}`);
  console.log(apply ? 'Mode: APPLY' : 'Mode: dry-run (pass --apply to write)');

  const sql = readFileSync(sqlPath, 'utf8');
  const plans = parseExerciseTemplateInsert(sql);
  console.log(`Parsed ${plans.length} legacy exerciseTemplate plans`);

  if (wipeImported || process.argv.includes('--wipe-only')) {
    const existing = await prisma.exercisePlan.findMany({
      where: { description: { startsWith: MMV1_TAG_PREFIX } },
      select: { id: true, name: true, description: true, _count: { select: { days: true } } }
    });
    console.log(`Found ${existing.length} previously imported plans to wipe`);
    for (const plan of existing) {
      console.log(`  - ${plan.name} (${plan._count.days} days) [${plan.description}]`);
    }
    if (apply && existing.length) {
      await prisma.exercisePlan.deleteMany({
        where: { id: { in: existing.map((plan) => plan.id) } }
      });
      console.log('Wiped imported plans (day templates cascaded).');
    }
    if (process.argv.includes('--wipe-only')) return;
  }

  const exerciseCache = new Map<string, string>();
  let plansWritten = 0;
  let daysWritten = 0;
  let itemsWritten = 0;
  let missingExercises = 0;

  for (const plan of plans) {
    const tag = mmv1Tag(plan.legacyId);
    const daySummaries = plan.circuits.map((circuit, index) => {
      const dayIndex = circuit.circuitnum ?? index + 1;
      const dayName = (circuit.name || '').trim() || `Routine ${dayIndex}`;
      return { dayIndex, dayName, itemCount: circuit.items?.length ?? 0 };
    });
    console.log(`\nPlan: ${plan.name} (legacy #${plan.legacyId})`);
    for (const day of daySummaries) {
      console.log(`  Day ${day.dayIndex}: ${day.dayName} (${day.itemCount} exercises)`);
    }

    if (!apply) continue;

    const existing = await prisma.exercisePlan.findFirst({
      where: { description: tag },
      select: { id: true }
    });

    const planRecord = existing
      ? await prisma.exercisePlan.update({
          where: { id: existing.id },
          data: {
            name: plan.name,
            description: tag,
            visibility: Visibility.GLOBAL
          }
        })
      : await prisma.exercisePlan.create({
          data: {
            name: plan.name,
            description: tag,
            visibility: Visibility.GLOBAL
          }
        });

    if (existing) {
      await prisma.exerciseTemplate.deleteMany({ where: { planId: planRecord.id } });
    }

    for (const [index, circuit] of plan.circuits.entries()) {
      const dayIndex = circuit.circuitnum ?? index + 1;
      const dayName = (circuit.name || '').trim() || `Routine ${dayIndex}`;
      const items = Array.isArray(circuit.items) ? circuit.items : [];

      const itemCreates: {
        exerciseId: string;
        sortOrder: number;
        sets: number | null;
        reps: number | null;
        durationSeconds: number | null;
        weight: number | null;
      }[] = [];

      for (const [itemIndex, item] of items.entries()) {
        const exerciseName = (item.name || '').trim();
        if (!exerciseName) continue;
        const exerciseId = await resolveExerciseId(
          exerciseName,
          item.category,
          exerciseCache,
          createMissingExercises
        );
        if (!exerciseId) {
          missingExercises += 1;
          console.warn(`    Missing exercise catalog entry: ${exerciseName}`);
          continue;
        }
        const sets = parseIntLoose(item.sets);
        const reps = parseIntLoose(item.reps);
        const durationSeconds = reps == null ? parseDurationSeconds(item.reps) : null;
        const weight = parseIntLoose(item.weight);
        itemCreates.push({
          exerciseId,
          sortOrder: typeof item.lcount === 'number' ? item.lcount : itemIndex,
          sets,
          reps,
          durationSeconds,
          weight
        });
      }

      await prisma.exerciseTemplate.create({
        data: {
          name: dayName,
          description: circuit.notes?.trim() || null,
          visibility: Visibility.GLOBAL,
          planId: planRecord.id,
          dayIndex,
          items: {
            create: itemCreates.map((entry) => ({
              exerciseId: entry.exerciseId,
              sortOrder: entry.sortOrder,
              sets: entry.sets,
              reps: entry.reps,
              durationSeconds: entry.durationSeconds,
              weight: entry.weight
            }))
          }
        }
      });
      daysWritten += 1;
      itemsWritten += itemCreates.length;
    }

    plansWritten += 1;
  }

  console.log('\n--- Summary ---');
  console.log(`Plans: ${plans.length} parsed${apply ? `, ${plansWritten} written` : ''}`);
  if (apply) {
    console.log(`Day templates: ${daysWritten}`);
    console.log(`Template items: ${itemsWritten}`);
    if (missingExercises) console.log(`Unresolved exercises skipped: ${missingExercises}`);
  } else {
    console.log('No changes written (dry-run).');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
