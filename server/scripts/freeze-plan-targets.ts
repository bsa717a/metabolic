import { ProgramStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { userDayKey } from '../src/utils/dates.js';
import { resolveTargets, freezeTargetsOnPeriod } from '../src/services/targetService.js';

/**
 * Backfill: freeze each active program's current plan period with the client's resolved
 * targets (coach pin → override band → formula) when it was never frozen. This repairs
 * legacy users whose PlanPeriods carry null targets and therefore fall back to a stale
 * template value for display and meal scaling.
 *
 * Dry-run by default. Pass --commit to write. Pass --email <addr> to scope to one user.
 */

const commit = process.argv.includes('--commit');
const email = process.argv.find((arg, i) => process.argv[i - 1] === '--email')?.trim().toLowerCase();

async function main() {
  const programs = await prisma.program.findMany({
    where: {
      status: ProgramStatus.ACTIVE,
      ...(email ? { user: { email: { equals: email, mode: 'insensitive' } } } : {})
    },
    select: { id: true, userId: true, user: { select: { email: true, timezone: true } } }
  });

  const results: Array<Record<string, unknown>> = [];

  for (const program of programs) {
    const todayKey = userDayKey(program.user.timezone);
    const today = new Date(`${todayKey}T12:00:00Z`);

    const activePeriod = await prisma.planPeriod.findFirst({
      where: { programId: program.id, effectiveDate: { lte: today } },
      orderBy: { effectiveDate: 'desc' },
      select: { id: true, effectiveDate: true, calorieTarget: true, targetSource: true }
    });

    if (!activePeriod) {
      results.push({ email: program.user.email, action: 'skip', reason: 'no active period' });
      continue;
    }
    if (activePeriod.calorieTarget != null) {
      results.push({ email: program.user.email, action: 'skip', reason: 'already frozen', source: activePeriod.targetSource });
      continue;
    }

    const resolved = await resolveTargets(program.userId);
    if (!resolved) {
      results.push({ email: program.user.email, action: 'skip', reason: 'profile incomplete (cannot resolve)' });
      continue;
    }

    if (commit) {
      await freezeTargetsOnPeriod(program.userId, program.id, activePeriod.effectiveDate);
    }
    results.push({
      email: program.user.email,
      action: commit ? 'frozen' : 'would-freeze',
      effectiveDate: activePeriod.effectiveDate.toISOString().slice(0, 10),
      calories: resolved.calories,
      protein: resolved.protein,
      carbs: resolved.carbs,
      fat: resolved.fat,
      source: resolved.source
    });
  }

  console.log(JSON.stringify({ commit, count: results.length, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
