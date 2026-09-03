import { prisma } from '../db/prisma.js';
import { getAiProvider, type ExerciseEstimate } from './aiService.js';

export type ExerciseLookupItem =
  | {
      source: 'existing';
      exercise: {
        id: string;
        name: string;
        category: string | null;
        bodyPart: string | null;
        description: string | null;
        defaultSets: number | null;
        defaultReps: number | null;
        defaultDurationSeconds: number | null;
        defaultDistance: number | null;
        requiresGym: boolean;
      };
    }
  | { source: 'ai'; lookup: { id: string }; estimate: ExerciseEstimate };

export type ExerciseLookupResult = {
  source: 'existing' | 'ai' | 'mixed';
  items: ExerciseLookupItem[];
};

async function findExistingExercises(query: string) {
  return prisma.exercise.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } },
        { bodyPart: { contains: query, mode: 'insensitive' } }
      ]
    },
    orderBy: { name: 'asc' },
    take: 5
  });
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function serializeCatalogExercise(
  exercise: Awaited<ReturnType<typeof findExistingExercises>>[number]
) {
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    bodyPart: exercise.bodyPart,
    description: exercise.description,
    defaultSets: exercise.defaultSets,
    defaultReps: exercise.defaultReps,
    defaultDurationSeconds: exercise.defaultDurationSeconds,
    defaultDistance: exercise.defaultDistance == null ? null : Number(exercise.defaultDistance),
    requiresGym: exercise.requiresGym
  };
}

export async function lookupExercise(userId: string, inputText: string): Promise<ExerciseLookupResult> {
  const query = inputText.trim();
  const existing = await findExistingExercises(query);
  const existingNames = new Set(existing.map((item) => normalizeName(item.name)));

  const estimates = await getAiProvider().lookupExercises(query);
  const aiItems: ExerciseLookupItem[] = [];

  for (const estimate of estimates) {
    if (existingNames.has(normalizeName(estimate.name))) continue;

    const lookup = await prisma.aiExerciseLookup.create({
      data: {
        userId,
        inputText: query,
        name: estimate.name,
        description: estimate.description,
        category: estimate.category,
        bodyPart: estimate.bodyPart,
        defaultSets: estimate.defaultSets,
        defaultReps: estimate.defaultReps,
        defaultDurationSeconds: estimate.defaultDurationSeconds,
        confidence: estimate.confidence
      }
    });

    aiItems.push({ source: 'ai', lookup: { id: lookup.id }, estimate });
  }

  const items: ExerciseLookupItem[] = [
    ...existing.map((exercise) => ({ source: 'existing' as const, exercise: serializeCatalogExercise(exercise) })),
    ...aiItems
  ];

  const hasExisting = existing.length > 0;
  const hasAi = aiItems.length > 0;
  const source = hasExisting && hasAi ? 'mixed' : hasExisting ? 'existing' : 'ai';

  return { source, items };
}

export async function acceptExerciseLookup(userId: string, lookupId: string) {
  return prisma.$transaction(async (tx) => {
    const lookup = await tx.aiExerciseLookup.findFirstOrThrow({ where: { id: lookupId, userId } });
    if (lookup.accepted && lookup.exerciseId) {
      return tx.exercise.findUniqueOrThrow({ where: { id: lookup.exerciseId } });
    }

    const created = await tx.exercise.create({
      data: {
        name: lookup.name,
        description: lookup.description,
        category: lookup.category,
        bodyPart: lookup.bodyPart,
        defaultSets: lookup.defaultSets,
        defaultReps: lookup.defaultReps,
        defaultDurationSeconds: lookup.defaultDurationSeconds
      }
    });

    await tx.aiExerciseLookup.update({
      where: { id: lookupId },
      data: { accepted: true, exerciseId: created.id }
    });

    return created;
  });
}
