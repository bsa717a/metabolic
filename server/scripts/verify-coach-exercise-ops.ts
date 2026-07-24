/**
 * Prove-it harness for coach day-level exercise tools.
 *
 * Drives add → update → skip → mark-done → remove through `executeExerciseTool`
 * (the same executor web + SMS use), asserting real database state after each step.
 *
 * Usage:
 *   npx tsx scripts/verify-coach-exercise-ops.ts [userId]
 *
 * With no argument it auto-picks the first user with an ACTIVE program. It works on a far-future day
 * (today + 22) so it never disturbs real plan data, and cleans up everything it creates on exit.
 */
import { ProgramStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { parseDateParam } from '../src/utils/dates.js';
import { executeExerciseTool, type ExerciseToolContext } from '../src/services/exerciseTools.js';
import { getScheduledExercises } from '../src/services/exerciseService.js';

type Result = Record<string, unknown> | null;

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  \u2714 ${label}`);
  } else {
    failed += 1;
    console.log(`  \u2716 ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

function noError(label: string, res: Result): boolean {
  const ok = !!res && !('error' in res);
  check(label, ok, ok ? undefined : res);
  return ok;
}

async function run() {
  const argUserId = process.argv[2];
  const program = argUserId
    ? await prisma.program.findFirst({
        where: { userId: argUserId, status: ProgramStatus.ACTIVE },
        include: { user: true }
      })
    : await prisma.program.findFirst({
        where: { status: ProgramStatus.ACTIVE },
        include: { user: true }
      });

  if (!program) {
    console.error(
      'No user with an ACTIVE program found. Pass a userId that has one: npx tsx scripts/verify-coach-exercise-ops.ts <userId>'
    );
    process.exitCode = 1;
    return;
  }

  const userId = program.userId;
  const timeZone = program.user.timezone;
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 22);
  const date = base.toISOString().slice(0, 10);
  const EXERCISE_NAME = 'E2E Coach Push-ups';

  console.log(`\nVerifying coach exercise operations for user ${userId} on ${date}\n`);

  const ctx: ExerciseToolContext = { userId, dateKey: date, timeZone, message: '', toolCalls: [] };
  let exerciseId = '';
  const catalogIdsToMaybeDelete: string[] = [];

  try {
    // Clear any leftover scheduled items on this far-future day first.
    await prisma.scheduledExercise.deleteMany({
      where: { userId, scheduledDate: parseDateParam(date) }
    });

    console.log('add_exercise');
    const added = await executeExerciseTool(ctx, 'add_exercise', {
      name: EXERCISE_NAME,
      date,
      sets: 3,
      reps: 10
    });
    if (noError('add_exercise succeeds', added)) {
      exerciseId = String((added as { exerciseId?: string }).exerciseId ?? '');
      check('new scheduled exercise has an id', Boolean(exerciseId));
      const day = await getScheduledExercises(userId, date);
      check('day has 1 exercise', day.length === 1, day.map((d) => d.exercise.name));
      check('prescription is 3x10', day[0]?.sets === 3 && day[0]?.reps === 10);
      const catalogId = day[0]?.exerciseId;
      if (catalogId) catalogIdsToMaybeDelete.push(catalogId);
    }

    console.log('get_exercise_details');
    const details = await executeExerciseTool(ctx, 'get_exercise_details', { date });
    if (noError('get_exercise_details succeeds', details)) {
      const exercises = (details as { exercises?: Array<{ id: string; name: string }> }).exercises ?? [];
      check('details include the added exercise', exercises.some((ex) => ex.id === exerciseId));
      check('result string mentions the name', String((details as { result?: string }).result).includes(EXERCISE_NAME));
    }

    console.log('update_exercise');
    const updated = await executeExerciseTool(ctx, 'update_exercise', {
      exerciseId,
      date,
      sets: 4,
      reps: 8
    });
    if (noError('update_exercise succeeds', updated)) {
      const day = await getScheduledExercises(userId, date);
      check('prescription updated to 4x8', day[0]?.sets === 4 && day[0]?.reps === 8);
    }

    console.log('skip_exercise');
    const skipped = await executeExerciseTool(ctx, 'skip_exercise', { exerciseId, date });
    if (noError('skip_exercise succeeds', skipped)) {
      const day = await getScheduledExercises(userId, date);
      check('status is SKIPPED', day[0]?.status === 'SKIPPED');
    }

    // Un-skip so mark-done has a planned item (toggle again).
    await executeExerciseTool(ctx, 'skip_exercise', { exerciseId, date });

    console.log('mark_exercise_done');
    const done = await executeExerciseTool(ctx, 'mark_exercise_done', {
      exerciseId,
      date,
      actualSets: 4,
      actualReps: 8
    });
    if (noError('mark_exercise_done succeeds', done)) {
      const day = await getScheduledExercises(userId, date);
      check('status is DONE', day[0]?.status === 'DONE');
    }

    console.log('suggest_exercises (read-only)');
    const beforeCount = (await getScheduledExercises(userId, date)).length;
    const suggested = await executeExerciseTool(ctx, 'suggest_exercises', {
      request: 'bodyweight core exercise',
      date
    });
    if (noError('suggest_exercises succeeds', suggested)) {
      const afterCount = (await getScheduledExercises(userId, date)).length;
      check('suggest does not mutate the day', afterCount === beforeCount);
      check('suggest returns a result string', typeof (suggested as { result?: string }).result === 'string');
    }

    console.log('remove_exercise');
    const removed = await executeExerciseTool(ctx, 'remove_exercise', { exerciseId, date });
    if (noError('remove_exercise succeeds', removed)) {
      const day = await getScheduledExercises(userId, date);
      check('day is empty after remove', day.length === 0);
    }

    console.log('add + mark_all_exercises_done');
    const a = await executeExerciseTool(ctx, 'add_exercise', { name: 'E2E Coach Squats', date, sets: 2, reps: 12 });
    const b = await executeExerciseTool(ctx, 'add_exercise', { name: 'E2E Coach Plank', date, durationMinutes: 1 });
    noError('second add succeeds', a);
    noError('third add succeeds', b);
    const allDone = await executeExerciseTool(ctx, 'mark_all_exercises_done', { date });
    if (noError('mark_all_exercises_done succeeds', allDone)) {
      const day = await getScheduledExercises(userId, date);
      check(
        'all planned are done',
        day.length > 0 && day.every((item) => item.status === 'DONE'),
        day.map((d) => d.status)
      );
      for (const item of day) catalogIdsToMaybeDelete.push(item.exerciseId);
    }
  } finally {
    console.log('\nCleanup');
    await prisma.scheduledExercise.deleteMany({
      where: { userId, scheduledDate: parseDateParam(date) }
    });
    // Only delete catalog rows we created for this harness (name prefix).
    await prisma.exercise.deleteMany({
      where: {
        id: { in: catalogIdsToMaybeDelete },
        name: { startsWith: 'E2E Coach' }
      }
    });
    const leftover = await getScheduledExercises(userId, date);
    check('cleanup left day empty', leftover.length === 0);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
