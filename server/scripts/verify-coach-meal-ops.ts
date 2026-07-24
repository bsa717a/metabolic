/**
 * Phase 5 "prove it" harness for the Coach-First Reliability Rework.
 *
 * Drives EVERY meal operation the coach can perform through the SAME shared executor both the web
 * coach and the SMS coach use (`executeMealTool`), asserting the real database state after each step.
 * This proves the build-and-maintain-meals plumbing end-to-end without depending on the live model's
 * tool selection (which is exercised separately by the prompt + catalog tests).
 *
 * Usage:
 *   npx tsx scripts/verify-coach-meal-ops.ts [userId]
 *
 * With no argument it auto-picks the first user with an ACTIVE program. It works on a far-future day
 * (today + 20) so it never disturbs real plan data, and cleans up everything it creates on exit.
 */
import { ProgramStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { parseDateParam } from '../src/utils/dates.js';
import { executeMealTool, type MealToolContext } from '../src/services/mealTools.js';
import { loadMealState } from '../src/services/planEditService.js';

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
    ? await prisma.program.findFirst({ where: { userId: argUserId, status: ProgramStatus.ACTIVE }, include: { user: true } })
    : await prisma.program.findFirst({ where: { status: ProgramStatus.ACTIVE }, include: { user: true } });

  if (!program) {
    console.error('No user with an ACTIVE program found. Pass a userId that has one: npx tsx scripts/verify-coach-meal-ops.ts <userId>');
    process.exitCode = 1;
    return;
  }

  const userId = program.userId;
  const timeZone = program.user.timezone;
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 20);
  const date = base.toISOString().slice(0, 10);
  const copyBase = new Date();
  copyBase.setUTCDate(copyBase.getUTCDate() + 21);
  const copyDate = copyBase.toISOString().slice(0, 10);
  const MEAL = 'E2E Coach Snack';

  console.log(`\nVerifying coach meal operations for user ${userId} on ${date} (copy target ${copyDate})\n`);

  // Track which daily logs existed before so cleanup never destroys a real future plan.
  const preExisting = new Set(
    (
      await prisma.dailyLog.findMany({
        where: { userId, date: { in: [parseDateParam(date), parseDateParam(copyDate)] } },
        select: { date: true }
      })
    ).map((row) => row.date.toISOString().slice(0, 10))
  );

  const ctx: MealToolContext = { userId, dateKey: date, timeZone, message: '', toolCalls: [] };
  let mealId = '';

  try {
    console.log('create_meal');
    const created = await executeMealTool(ctx, 'create_meal', {
      mealName: MEAL,
      date,
      plannedTime: '3pm',
      items: [{ name: 'Protein Bar', quantity: 1, unit: 'bar', calories: 200, protein: 20, carbs: 20, fat: 7 }]
    });
    if (noError('create_meal succeeds', created)) {
      mealId = String((created as { meal?: { mealId?: string } }).meal?.mealId ?? '');
      check('new meal has an id', Boolean(mealId));
      const state = await loadMealState(mealId, date);
      check('meal seeded with 1 item', state.items.length === 1, state.items);
      // Pin subsequent edits to this meal exactly as the coach does via activeMeal.
      ctx.activeMeal = { mealId, mealName: MEAL, date };
    }

    console.log('add_meal_item');
    const added = await executeMealTool(ctx, 'add_meal_item', {
      name: 'Banana',
      quantity: 1,
      unit: 'medium',
      calories: 105,
      protein: 1,
      carbs: 27,
      fat: 0
    });
    if (noError('add_meal_item succeeds', added)) {
      const state = await loadMealState(mealId, date);
      check('meal now has 2 items', state.items.length === 2, state.items.map((i) => i.name));
    }

    console.log('update_meal_item');
    const updated = await executeMealTool(ctx, 'update_meal_item', {
      itemName: 'Banana',
      quantity: 2,
      calories: 210,
      protein: 2,
      carbs: 54,
      fat: 0
    });
    if (noError('update_meal_item succeeds', updated)) {
      const state = await loadMealState(mealId, date);
      const banana = state.items.find((i) => i.name.toLowerCase().includes('banana'));
      check('banana quantity updated to 2', banana?.quantity === 2, banana);
    }

    console.log('remove_meal_item');
    const removed = await executeMealTool(ctx, 'remove_meal_item', { itemName: 'Protein Bar' });
    if (noError('remove_meal_item succeeds', removed)) {
      const state = await loadMealState(mealId, date);
      check('protein bar removed (1 item left)', state.items.length === 1, state.items.map((i) => i.name));
    }

    console.log('rename_meal');
    const renamed = await executeMealTool(ctx, 'rename_meal', { newName: 'E2E Renamed Snack' });
    if (noError('rename_meal succeeds', renamed)) {
      const state = await loadMealState(mealId, date);
      check('meal name changed', state.mealName === 'E2E Renamed Snack', state.mealName);
      if (ctx.activeMeal) ctx.activeMeal.mealName = 'E2E Renamed Snack';
    }

    console.log('update_meal_time');
    const retimed = await executeMealTool(ctx, 'update_meal_time', { plannedTime: '4:30pm' });
    if (noError('update_meal_time succeeds', retimed)) {
      const state = await loadMealState(mealId, date);
      check('planned time set to 16:30', state.plannedTime === '16:30', state.plannedTime);
    }

    console.log('update_planned_meals (full swap)');
    const swapped = await executeMealTool(ctx, 'update_planned_meals', {
      date,
      meals: [
        {
          mealName: 'E2E Renamed Snack',
          items: [
            { name: 'Greek Yogurt', quantity: 1, unit: 'cup', calories: 150, protein: 20, carbs: 8, fat: 4 },
            { name: 'Blueberries', quantity: 1, unit: 'cup', calories: 85, protein: 1, carbs: 21, fat: 0 }
          ]
        }
      ]
    });
    if (noError('update_planned_meals succeeds', swapped)) {
      const state = await loadMealState(mealId, date);
      check('all items replaced (2 new items)', state.items.length === 2, state.items.map((i) => i.name));
      check('swap kept the same meal (rename preserved)', state.mealName === 'E2E Renamed Snack', state.mealName);
    }

    console.log('copy_meal_to_days');
    const copied = await executeMealTool(ctx, 'copy_meal_to_days', { targetDates: [copyDate] });
    if (noError('copy_meal_to_days succeeds', copied)) {
      const targetMeal = await prisma.meal.findFirst({
        where: { dailyLog: { userId, date: parseDateParam(copyDate) }, name: 'E2E Renamed Snack' },
        include: { items: true }
      });
      check('meal copied to target day', Boolean(targetMeal), copied);
      check('copied meal carries its items', (targetMeal?.items.length ?? 0) === 2, targetMeal?.items.length);
    }

    console.log('delete_meal');
    const deleted = await executeMealTool(ctx, 'delete_meal', {});
    if (noError('delete_meal succeeds', deleted)) {
      const gone = await prisma.meal.findUnique({ where: { id: mealId } });
      check('meal deleted from source day', gone === null);
    }
  } finally {
    // Cleanup: remove our test meals; drop any daily log we created for a day that had none before.
    console.log('\ncleanup');
    for (const day of [date, copyDate]) {
      const dayDate = parseDateParam(day);
      if (preExisting.has(day)) {
        await prisma.meal.deleteMany({
          where: { dailyLog: { userId, date: dayDate }, name: { in: [MEAL, 'E2E Renamed Snack'] } }
        });
      } else {
        await prisma.dailyLog.deleteMany({ where: { userId, date: dayDate } });
      }
    }
    console.log('  \u2714 cleaned up test data');
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run()
  .catch((error) => {
    console.error('Verification crashed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
