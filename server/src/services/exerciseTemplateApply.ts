import { ExerciseStatus, type Prisma } from '@prisma/client';
import { parseDateParam } from '../utils/dates.js';

const templateInclude = {
  items: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { exercise: true }
  }
} satisfies Prisma.ExerciseTemplateInclude;

export type TemplateItemPrescriptionOverride = {
  sets?: number | null;
  reps?: string | null;
  speed?: string | null;
  durationSeconds?: number | null;
  distance?: number | null;
  weight?: number | null;
};

export async function applyTemplateExercisesToDate(
  tx: Prisma.TransactionClient,
  templateId: string,
  programId: string,
  userId: string,
  date: string,
  overridesByTemplateItemId?: Map<string, TemplateItemPrescriptionOverride>
) {
  const template = await tx.exerciseTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: templateInclude
  });

  const day = parseDateParam(date);

  await tx.scheduledExercise.deleteMany({
    where: { userId, programId, scheduledDate: day }
  });

  if (template.items.length) {
    await tx.scheduledExercise.createMany({
      data: template.items.map((item) => {
        const override = overridesByTemplateItemId?.get(item.id);
        return {
          programId,
          userId,
          exerciseId: item.exerciseId,
          scheduledDate: day,
          sets: override ? (override.sets ?? null) : item.sets,
          reps: override ? (override.reps ?? null) : item.reps,
          speed: override ? (override.speed ?? null) : item.speed,
          durationSeconds: override ? (override.durationSeconds ?? null) : item.durationSeconds,
          distance: override ? (override.distance ?? null) : item.distance,
          weight: override ? (override.weight ?? null) : item.weight,
          status: ExerciseStatus.PLANNED,
          sortOrder: item.sortOrder
        };
      })
    });
  }

  const log = await tx.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } }
  });
  if (log) {
    await tx.dailyLog.update({
      where: { id: log.id },
      data: { exercisesPlanned: template.items.length }
    });
  }
}

export async function applyDefaultTemplateToNewDay(
  tx: Prisma.TransactionClient,
  program: { id: string; defaultExerciseTemplateId: string | null },
  userId: string,
  targetDate: Date
) {
  if (!program.defaultExerciseTemplateId) return false;
  const date = targetDate.toISOString().slice(0, 10);
  await applyTemplateExercisesToDate(tx, program.defaultExerciseTemplateId, program.id, userId, date);
  return true;
}

export async function applyDefaultTemplateToNewDayOutsideTx(
  program: { id: string; defaultExerciseTemplateId: string | null },
  userId: string,
  targetDate: Date
) {
  if (!program.defaultExerciseTemplateId) return false;
  const { prisma } = await import('../db/prisma.js');
  await prisma.$transaction(async (tx) => {
    await applyDefaultTemplateToNewDay(tx, program, userId, targetDate);
  });
  return true;
}
