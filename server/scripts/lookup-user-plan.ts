/**
 * Look up a user's program and active plan details (read-only).
 *
 *   cd server && npx tsx --env-file=.env scripts/lookup-user-plan.ts --email user@example.com
 */
import { ProgramStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';
import { userDayKey } from '../src/utils/dates.js';
import { resolvePlanForDate } from '../src/services/planResolution.js';
import { getPlanStatus } from '../src/services/planStatusService.js';

const email = process.argv.find((arg, i) => process.argv[i - 1] === '--email')?.trim().toLowerCase();
if (!email) {
  console.error('Usage: lookup-user-plan.ts --email user@example.com');
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: {
      coachAssignments: { include: { coach: { select: { email: true, firstName: true, lastName: true } } } },
      programs: {
        include: {
          defaultNutritionTemplate: { select: { id: true, name: true } },
          defaultExerciseTemplate: { select: { id: true, name: true } },
          metrics: { where: { metricType: { in: ['WEIGHT', 'CALORIES', 'PROTEIN'] } } }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!user) {
    console.log(JSON.stringify({ found: false, email }, null, 2));
    return;
  }

  const activeProgram = user.programs.find((p) => p.status === ProgramStatus.ACTIVE) ?? null;
  const todayKey = userDayKey(user.timezone);
  const planStatus = await getPlanStatus(user.id);

  let resolvedPlan: {
    nutritionTemplateId: string | null;
    nutritionTemplateName: string | null;
    exerciseTemplateId: string | null;
    exerciseTemplateName: string | null;
    weekNumber: number | null;
  } | null = null;

  if (activeProgram) {
    const plan = await resolvePlanForDate(activeProgram, new Date(`${todayKey}T12:00:00Z`));
    const [nutrition, exercise] = await Promise.all([
      plan.nutritionTemplateId
        ? prisma.nutritionPlanTemplate.findUnique({ where: { id: plan.nutritionTemplateId }, select: { name: true } })
        : null,
      plan.exerciseTemplateId
        ? prisma.exerciseTemplate.findUnique({ where: { id: plan.exerciseTemplateId }, select: { name: true } })
        : null
    ]);
    const period = await prisma.planPeriod.findFirst({
      where: { programId: activeProgram.id, effectiveDate: { lte: new Date(`${todayKey}T12:00:00Z`) } },
      orderBy: { effectiveDate: 'desc' },
      select: { weekNumber: true, effectiveDate: true, nutritionTemplateId: true, exerciseTemplateId: true }
    });
    resolvedPlan = {
      nutritionTemplateId: plan.nutritionTemplateId,
      nutritionTemplateName: nutrition?.name ?? null,
      exerciseTemplateId: plan.exerciseTemplateId,
      exerciseTemplateName: exercise?.name ?? null,
      weekNumber: period?.weekNumber ?? null
    };
  }

  console.log(
    JSON.stringify(
      {
        found: true,
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          firebaseUid: user.firebaseUid,
          timezone: user.timezone,
          coaches: user.coachAssignments.map((a) => ({
            email: a.coach.email,
            name: `${a.coach.firstName} ${a.coach.lastName}`.trim()
          }))
        },
        activeProgram: activeProgram
          ? {
              id: activeProgram.id,
              name: activeProgram.name,
              status: activeProgram.status,
              mode: activeProgram.mode,
              startDate: activeProgram.startDate.toISOString().slice(0, 10),
              defaultNutritionTemplate: activeProgram.defaultNutritionTemplate?.name ?? null,
              defaultExerciseTemplate: activeProgram.defaultExerciseTemplate?.name ?? null
            }
          : null,
        allPrograms: user.programs.map((p) => ({ name: p.name, status: p.status, mode: p.mode })),
        planStatus,
        resolvedPlanForToday: resolvedPlan,
        todayKey
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
