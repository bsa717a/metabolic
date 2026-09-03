/**
 * Shared exercise-management tool catalog for BOTH the web coach and the SMS coach.
 * Day-level parity with meal item tools: read today's plan, suggest workouts/exercises,
 * add/update/remove/skip, and mark done. Templates/routines are intentionally out of scope.
 */
import { Type, type FunctionDeclaration } from '@google/genai';
import { ExerciseStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addUtcDays, parseDateParam, toDateKey } from '../utils/dates.js';
import { defaultRepsToScheme, normalizeRepScheme } from '../utils/repSchemes.js';
import {
  createScheduledExercise,
  deleteScheduledExercise,
  ensureExercisesForDate,
  getScheduledExercises,
  markAllPlannedExercisesDone,
  markDone,
  toggleSkipScheduledExercise,
  updateScheduledExercise,
  type ExerciseActuals
} from './exerciseService.js';
import { lookupExercise } from './exerciseLookupService.js';

export type ExerciseToolContext = {
  userId: string;
  dateKey: string;
  timeZone: string | null;
  message: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
};

/** Every exercise tool name — shared by web + SMS. */
export const EXERCISE_MANAGEMENT_TOOLS = new Set([
  'get_exercise_details',
  'suggest_exercises',
  'add_exercise',
  'update_exercise',
  'remove_exercise',
  'skip_exercise',
  'mark_exercise_done',
  'mark_all_exercises_done'
]);

/** Tools that mutate the day plan (triggers client refresh). */
export const EXERCISE_MUTATION_TOOLS = new Set([
  'add_exercise',
  'update_exercise',
  'remove_exercise',
  'skip_exercise',
  'mark_exercise_done',
  'mark_all_exercises_done'
]);

const DATE_DESC =
  'Target day: "today" (default), "yesterday", "tomorrow", or YYYY-MM-DD. Resolve relative dates from context.';
const EXERCISE_NAME_DESC = 'Exercise name, e.g. "Push-ups", "Goblet squat", "Walk".';
const EXERCISE_ID_DESC = 'Exact scheduled-exercise id when known from a prior get_exercise_details.';

export type DayExerciseState = {
  id: string;
  name: string;
  status: string;
  sets: number | null;
  reps: string | null;
  durationSeconds: number | null;
  weight: number | null;
  distance: number | null;
};

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function nullableNum(value: unknown): number | null | undefined {
  if (value === null) return null;
  return num(value);
}

function resolveDate(dateArg: string | undefined, todayKey: string): { dateKey: string; label: string } {
  const today = parseDateParam(todayKey);
  const lower = dateArg?.trim().toLowerCase() ?? '';
  if (!lower || lower === 'today') return { dateKey: todayKey, label: 'today' };
  if (lower === 'yesterday') return { dateKey: toDateKey(addUtcDays(today, -1)), label: 'yesterday' };
  if (lower === 'tomorrow') return { dateKey: toDateKey(addUtcDays(today, 1)), label: 'tomorrow' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) return { dateKey: lower, label: lower === todayKey ? 'today' : lower };
  return { dateKey: todayKey, label: 'today' };
}

function formatPrescription(ex: {
  sets: number | null;
  reps: string | null;
  durationSeconds: number | null;
  weight: number | null;
  distance: number | null;
}): string {
  const bits: string[] = [];
  if (ex.sets != null && ex.reps != null) bits.push(`${ex.sets}x${ex.reps}`);
  else if (ex.reps != null) bits.push(`${ex.reps} reps`);
  else if (ex.durationSeconds != null) {
    const s = ex.durationSeconds;
    bits.push(s % 60 === 0 ? `${s / 60} min` : `${s}s`);
  }
  if (ex.weight != null) bits.push(`${Number(ex.weight)} lb`);
  if (ex.distance != null) bits.push(`${Number(ex.distance)} mi`);
  return bits.join(', ');
}

function toDayState(
  items: Awaited<ReturnType<typeof getScheduledExercises>>
): DayExerciseState[] {
  return items.map((item) => ({
    id: item.id,
    name: item.exercise.name,
    status: item.status,
    sets: item.sets,
    reps: item.reps,
    durationSeconds: item.durationSeconds,
    weight: item.weight == null ? null : Number(item.weight),
    distance: item.distance == null ? null : Number(item.distance)
  }));
}

function formatDayResult(label: string, exercises: DayExerciseState[]): string {
  if (!exercises.length) return `No workout is scheduled for ${label}.`;
  const done = exercises.filter((ex) => ex.status === 'DONE').length;
  const lines = exercises.map((ex, index) => {
    const detail = formatPrescription(ex);
    const mark = ex.status === 'DONE' ? ' — done' : ex.status === 'SKIPPED' ? ' — skipped' : '';
    return `${index + 1}. ${ex.name}${detail ? ` (${detail})` : ''}${mark}`;
  });
  return `Workout for ${label}: ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}, ${done} done. ${lines.join('; ')}.`;
}

async function loadDay(userId: string, dateKey: string) {
  await ensureExercisesForDate(userId, dateKey);
  return getScheduledExercises(userId, dateKey);
}

/** Prefer exact scheduled id; otherwise fuzzy-match by name on that day. */
async function findScheduled(
  userId: string,
  dateKey: string,
  opts: { exerciseId?: string; exerciseName?: string; anyStatus?: boolean }
) {
  const items = await loadDay(userId, dateKey);
  if (opts.exerciseId) {
    const byId = items.find((item) => item.id === opts.exerciseId);
    if (byId) return byId;
  }
  const query = opts.exerciseName?.toLowerCase().trim();
  if (!query) return undefined;
  const pool = opts.anyStatus ? items : items.filter((item) => item.status === ExerciseStatus.PLANNED);
  return (
    pool.find((item) => item.exercise.name.toLowerCase() === query) ??
    pool.find((item) => item.exercise.name.toLowerCase().includes(query)) ??
    items.find((item) => item.exercise.name.toLowerCase().includes(query))
  );
}

/** Resolve a catalog exercise from a free-text name. Prefer an exact/close catalog match;
 *  otherwise create a new catalog row under the requested name (AI may supply defaults). */
async function resolveCatalogExercise(userId: string, name: string) {
  const query = name.trim();
  if (!query) throw new Error('Which exercise should I add?');
  const normalized = query.toLowerCase();

  const exact = await prisma.exercise.findFirst({
    where: { name: { equals: query, mode: 'insensitive' } }
  });
  if (exact) return exact;

  const lookup = await lookupExercise(userId, query);
  const catalogHit = lookup.items.find(
    (item) => item.source === 'existing' && item.exercise.name.toLowerCase() === normalized
  );
  if (catalogHit && catalogHit.source === 'existing') {
    return prisma.exercise.findUniqueOrThrow({ where: { id: catalogHit.exercise.id } });
  }

  // Close contains match (e.g. "push ups" → "Push-ups") — only when the catalog name is short/similar.
  const close = lookup.items.find((item) => {
    if (item.source !== 'existing') return false;
    const catalogName = item.exercise.name.toLowerCase();
    return catalogName.includes(normalized) || normalized.includes(catalogName);
  });
  if (close && close.source === 'existing') {
    return prisma.exercise.findUniqueOrThrow({ where: { id: close.exercise.id } });
  }

  const aiHit = lookup.items.find((item) => item.source === 'ai');
  const defaults =
    aiHit && aiHit.source === 'ai'
      ? {
          description: aiHit.estimate.description,
          category: aiHit.estimate.category,
          bodyPart: aiHit.estimate.bodyPart,
          defaultSets: aiHit.estimate.defaultSets,
          defaultReps: aiHit.estimate.defaultReps,
          defaultDurationSeconds: aiHit.estimate.defaultDurationSeconds
        }
      : {};

  // Keep the user's wording as the catalog name so the coach confirms what they asked for.
  return prisma.exercise.create({
    data: { name: query, ...defaults }
  });
}

export function buildExerciseToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: 'get_exercise_details',
      description:
        "Look up the user's scheduled workout for a day — exercise names, ids, sets/reps/duration/weight, and which are done or skipped. Use for \"what's my workout\", \"how many sets\", \"did I finish\". ALWAYS call this before editing when you don't already have ids. Read-only.",
      parameters: {
        type: Type.OBJECT,
        properties: { date: { type: Type.STRING, description: DATE_DESC } }
      }
    },
    {
      name: 'suggest_exercises',
      description:
        'Suggest NEW exercises or a short workout that fits the user (equipment, time, body part, home vs gym). Use for \"what should I do today\", \"swap this workout\", \"quick upper body\", \"no equipment\". Returns numbered options — does NOT change the plan until they confirm and you call add_exercise. Read-only.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          request: {
            type: Type.STRING,
            description: 'What they want, e.g. "20-minute home workout, no equipment" or "replace push-ups with something easier".'
          },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'add_exercise',
      description:
        'Add one exercise to the day plan. Resolve the name to the catalog (or create it), then schedule it with optional sets/reps/duration/weight. Use after they pick a suggestion or name an exercise to add.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: EXERCISE_NAME_DESC },
          date: { type: Type.STRING, description: DATE_DESC },
          sets: { type: Type.NUMBER, description: 'Number of sets.' },
          reps: {
            type: Type.STRING,
            description: 'Rep scheme: "10", "15/12/10", or "20/17/15".'
          },
          durationSeconds: { type: Type.NUMBER, description: 'Duration in seconds for timed exercises (e.g. 30 for a plank, 1200 for a 20-minute run).' },
          weight: { type: Type.NUMBER, description: 'Weight in pounds, if applicable.' },
          distance: { type: Type.NUMBER, description: 'Distance in miles, if applicable.' }
        },
        required: ['name']
      }
    },
    {
      name: 'update_exercise',
      description:
        'Change the prescription of one scheduled exercise (sets, reps, duration, weight, distance). Prefer exerciseId from get_exercise_details; otherwise match by name.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          exerciseId: { type: Type.STRING, description: EXERCISE_ID_DESC },
          exerciseName: { type: Type.STRING, description: EXERCISE_NAME_DESC },
          date: { type: Type.STRING, description: DATE_DESC },
          sets: { type: Type.NUMBER },
          reps: {
            type: Type.STRING,
            description: 'Rep scheme: "10", "15/12/10", or "20/17/15".'
          },
          durationSeconds: { type: Type.NUMBER },
          weight: { type: Type.NUMBER },
          distance: { type: Type.NUMBER }
        }
      }
    },
    {
      name: 'remove_exercise',
      description: 'Remove one exercise from the day plan. Prefer exerciseId; otherwise match by name.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          exerciseId: { type: Type.STRING, description: EXERCISE_ID_DESC },
          exerciseName: { type: Type.STRING, description: EXERCISE_NAME_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'skip_exercise',
      description: 'Mark one planned exercise as skipped (or un-skip if already skipped). Prefer exerciseId; otherwise match by name.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          exerciseId: { type: Type.STRING, description: EXERCISE_ID_DESC },
          exerciseName: { type: Type.STRING, description: EXERCISE_NAME_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'mark_exercise_done',
      description:
        'Mark a single planned exercise done. Optionally name it (or pass exerciseId); omit to use the next planned exercise. Optional actuals when the user reports what they did.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          exerciseId: { type: Type.STRING, description: EXERCISE_ID_DESC },
          exerciseName: { type: Type.STRING, description: 'Name of the exercise to mark done.' },
          date: { type: Type.STRING, description: DATE_DESC },
          actualSets: { type: Type.NUMBER },
          actualReps: { type: Type.NUMBER },
          actualDurationSeconds: { type: Type.NUMBER },
          actualWeight: { type: Type.NUMBER },
          actualDistance: { type: Type.NUMBER }
        }
      }
    },
    {
      name: 'mark_all_exercises_done',
      description: "Mark all of the day's planned exercises done. Use for \"mark all exercises done\" or \"workout done\".",
      parameters: {
        type: Type.OBJECT,
        properties: { date: { type: Type.STRING, description: DATE_DESC } }
      }
    }
  ];
}

function errorResult(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

/** Runs an exercise tool. Returns null if `name` is not an exercise tool. */
export async function executeExerciseTool(
  ctx: ExerciseToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!EXERCISE_MANAGEMENT_TOOLS.has(name)) return null;

  switch (name) {
    case 'get_exercise_details': {
      try {
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const items = await loadDay(ctx.userId, dateKey);
        const exercises = toDayState(items);
        ctx.toolCalls.push({ name, args: { date: dateKey } });
        return { result: formatDayResult(label, exercises), date: dateKey, exercises };
      } catch (error) {
        return errorResult(error, 'Could not look up that workout.');
      }
    }

    case 'suggest_exercises': {
      try {
        const request = str(args.request) || ctx.message;
        if (!request) return { error: 'What kind of workout or exercise are you looking for?' };
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const [user, dayItems] = await Promise.all([
          prisma.user.findUnique({ where: { id: ctx.userId }, select: { firstName: true } }),
          loadDay(ctx.userId, dateKey)
        ]);
        const dayNames = dayItems.map((item) => item.exercise.name).join(', ') || 'none planned';
        const enrichedQuery = [
          request,
          `Current plan for ${label}: ${dayNames}.`,
          user?.firstName ? `Client: ${user.firstName}.` : ''
        ]
          .filter(Boolean)
          .join(' ');

        const lookup = await lookupExercise(ctx.userId, enrichedQuery);
        const options = lookup.items.slice(0, 5).map((item, index) => {
          if (item.source === 'existing') {
            const ex = item.exercise;
            const presc =
              ex.defaultSets != null && ex.defaultReps != null
                ? `${ex.defaultSets}x${ex.defaultReps}`
                : ex.defaultDurationSeconds != null
                  ? ex.defaultDurationSeconds % 60 === 0
                    ? `${ex.defaultDurationSeconds / 60} min`
                    : `${ex.defaultDurationSeconds}s`
                  : '';
            return {
              number: index + 1,
              name: ex.name,
              description: ex.description ?? '',
              prescription: presc,
              exerciseId: ex.id,
              sets: ex.defaultSets,
              reps: ex.defaultReps,
              durationSeconds: ex.defaultDurationSeconds
            };
          }
          const est = item.estimate;
          const presc =
            est.defaultSets != null && est.defaultReps != null
              ? `${est.defaultSets}x${est.defaultReps}`
              : est.defaultDurationSeconds != null
                ? est.defaultDurationSeconds % 60 === 0
                  ? `${est.defaultDurationSeconds / 60} min`
                  : `${est.defaultDurationSeconds}s`
                : '';
          return {
            number: index + 1,
            name: est.name,
            description: est.description,
            prescription: presc,
            lookupId: item.lookup.id,
            sets: est.defaultSets,
            reps: est.defaultReps,
            durationSeconds: est.defaultDurationSeconds
          };
        });

        if (!options.length) {
          ctx.toolCalls.push({ name, args: { request, date: dateKey } });
          return {
            result: `I don't have a solid suggestion for that yet — tell me equipment, time available, or a body part and I'll try again.`
          };
        }

        const lines = options.map((opt) => {
          const detail = [opt.prescription, opt.description].filter(Boolean).join(' — ');
          return `${opt.number}. ${opt.name}${detail ? ` (${detail})` : ''}`;
        });
        const result = `Here are a few options for ${label}:\n${lines.join('\n')}\nTell me a number (or name) and I'll add it to your plan.`;
        ctx.toolCalls.push({ name, args: { request, date: dateKey } });
        return { result, date: dateKey, options };
      } catch (error) {
        return errorResult(error, 'Could not suggest exercises.');
      }
    }

    case 'add_exercise': {
      try {
        const nameArg = str(args.name);
        if (!nameArg) return { error: 'Which exercise should I add?' };
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const catalog = await resolveCatalogExercise(ctx.userId, nameArg);
        const scheduled = await createScheduledExercise(ctx.userId, dateKey, {
          exerciseId: catalog.id,
          sets: nullableNum(args.sets) ?? catalog.defaultSets,
          reps:
            args.reps !== undefined
              ? normalizeRepScheme(args.reps)
              : defaultRepsToScheme(catalog.defaultReps),
          durationSeconds: nullableNum(args.durationSeconds) ?? catalog.defaultDurationSeconds,
          weight: nullableNum(args.weight),
          distance: nullableNum(args.distance)
        });
        const exercises = toDayState(await loadDay(ctx.userId, dateKey));
        const presc = formatPrescription({
          sets: scheduled.sets,
          reps: scheduled.reps,
          durationSeconds: scheduled.durationSeconds,
          weight: scheduled.weight == null ? null : Number(scheduled.weight),
          distance: scheduled.distance == null ? null : Number(scheduled.distance)
        });
        ctx.toolCalls.push({
          name,
          args: { name: catalog.name, date: dateKey, exerciseId: scheduled.id }
        });
        return {
          result: `Added ${catalog.name}${presc ? ` (${presc})` : ''} to ${label}. ${formatDayResult(label, exercises)}`,
          date: dateKey,
          exerciseId: scheduled.id,
          exercises
        };
      } catch (error) {
        return errorResult(error, 'Could not add that exercise.');
      }
    }

    case 'update_exercise': {
      try {
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const target = await findScheduled(ctx.userId, dateKey, {
          exerciseId: str(args.exerciseId) || undefined,
          exerciseName: str(args.exerciseName) || undefined,
          anyStatus: true
        });
        if (!target) return { error: 'I could not find that exercise on the plan — tell me the name or check the day.' };
        const patch = {
          ...(args.sets !== undefined ? { sets: nullableNum(args.sets) ?? null } : {}),
          ...(args.reps !== undefined ? { reps: normalizeRepScheme(args.reps) } : {}),
          ...(args.durationSeconds !== undefined
            ? { durationSeconds: nullableNum(args.durationSeconds) ?? null }
            : {}),
          ...(args.weight !== undefined ? { weight: nullableNum(args.weight) ?? null } : {}),
          ...(args.distance !== undefined ? { distance: nullableNum(args.distance) ?? null } : {})
        };
        if (!Object.keys(patch).length) {
          return { error: 'What should I change — sets, reps, duration, weight, or distance?' };
        }
        const updated = await updateScheduledExercise(ctx.userId, target.id, patch);
        const exercises = toDayState(await loadDay(ctx.userId, dateKey));
        const presc = formatPrescription({
          sets: updated.sets,
          reps: updated.reps,
          durationSeconds: updated.durationSeconds,
          weight: updated.weight == null ? null : Number(updated.weight),
          distance: updated.distance == null ? null : Number(updated.distance)
        });
        ctx.toolCalls.push({ name, args: { exerciseId: target.id, date: dateKey, ...patch } });
        return {
          result: `Updated ${updated.exercise.name}${presc ? ` to ${presc}` : ''} for ${label}.`,
          date: dateKey,
          exerciseId: target.id,
          exercises
        };
      } catch (error) {
        return errorResult(error, 'Could not update that exercise.');
      }
    }

    case 'remove_exercise': {
      try {
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const target = await findScheduled(ctx.userId, dateKey, {
          exerciseId: str(args.exerciseId) || undefined,
          exerciseName: str(args.exerciseName) || undefined,
          anyStatus: true
        });
        if (!target) return { error: 'I could not find that exercise on the plan.' };
        const removedName = target.exercise.name;
        await deleteScheduledExercise(ctx.userId, target.id);
        const exercises = toDayState(await loadDay(ctx.userId, dateKey));
        ctx.toolCalls.push({ name, args: { exerciseId: target.id, date: dateKey } });
        return {
          result: `Removed ${removedName} from ${label}. ${formatDayResult(label, exercises)}`,
          date: dateKey,
          exercises
        };
      } catch (error) {
        return errorResult(error, 'Could not remove that exercise.');
      }
    }

    case 'skip_exercise': {
      try {
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const target = await findScheduled(ctx.userId, dateKey, {
          exerciseId: str(args.exerciseId) || undefined,
          exerciseName: str(args.exerciseName) || undefined,
          anyStatus: true
        });
        if (!target) return { error: 'I could not find that exercise on the plan.' };
        const updated = await toggleSkipScheduledExercise(ctx.userId, target.id);
        const exercises = toDayState(await loadDay(ctx.userId, dateKey));
        const verb = updated.status === ExerciseStatus.SKIPPED ? 'Skipped' : 'Un-skipped';
        ctx.toolCalls.push({ name, args: { exerciseId: target.id, date: dateKey } });
        return {
          result: `${verb} ${updated.exercise.name} for ${label}.`,
          date: dateKey,
          exerciseId: target.id,
          exercises
        };
      } catch (error) {
        return errorResult(error, 'Could not skip that exercise.');
      }
    }

    case 'mark_exercise_done': {
      try {
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const items = await loadDay(ctx.userId, dateKey);
        const planned = items.filter((item) => item.status === ExerciseStatus.PLANNED);
        let target = await findScheduled(ctx.userId, dateKey, {
          exerciseId: str(args.exerciseId) || undefined,
          exerciseName: str(args.exerciseName) || undefined
        });
        if (!target && !str(args.exerciseId) && !str(args.exerciseName)) {
          target = planned[0];
        }
        if (!target) {
          return {
            error: str(args.exerciseName)
              ? `I could not find a planned exercise matching "${str(args.exerciseName)}".`
              : `No planned exercises left for ${label}.`
          };
        }
        const actuals: ExerciseActuals = {
          ...(args.actualSets !== undefined ? { actualSets: nullableNum(args.actualSets) ?? null } : {}),
          ...(args.actualReps !== undefined ? { actualReps: nullableNum(args.actualReps) ?? null } : {}),
          ...(args.actualDurationSeconds !== undefined
            ? { actualDurationSeconds: nullableNum(args.actualDurationSeconds) ?? null }
            : {}),
          ...(args.actualWeight !== undefined ? { actualWeight: nullableNum(args.actualWeight) ?? null } : {}),
          ...(args.actualDistance !== undefined
            ? { actualDistance: nullableNum(args.actualDistance) ?? null }
            : {})
        };
        const done = await markDone(ctx.userId, target.id, actuals);
        const exercises = toDayState(await loadDay(ctx.userId, dateKey));
        ctx.toolCalls.push({ name, args: { exerciseId: target.id, date: dateKey } });
        return {
          result: `Marked ${done.exercise.name} done for ${label}.`,
          date: dateKey,
          exerciseId: target.id,
          exercises
        };
      } catch (error) {
        return errorResult(error, 'Could not mark that exercise done.');
      }
    }

    case 'mark_all_exercises_done': {
      try {
        const { dateKey, label } = resolveDate(str(args.date) || undefined, ctx.dateKey);
        const names = await markAllPlannedExercisesDone(ctx.userId, dateKey);
        const exercises = toDayState(await loadDay(ctx.userId, dateKey));
        ctx.toolCalls.push({ name, args: { date: dateKey } });
        if (!names.length) {
          return { result: `No planned exercises left to mark done for ${label}.`, date: dateKey, exercises };
        }
        return {
          result: `Marked all ${names.length} planned exercise${names.length === 1 ? '' : 's'} done for ${label}.`,
          date: dateKey,
          exercises
        };
      } catch (error) {
        return errorResult(error, 'Could not mark exercises done.');
      }
    }

    default:
      return null;
  }
}
