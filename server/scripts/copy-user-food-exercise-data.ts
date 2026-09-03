import { MealItemType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SOURCE_EMAIL = 'user@metabolic.local';
const TARGET_EMAIL = 'derek.fowler@gmail.com';

async function main() {
  const source = await prisma.user.findUniqueOrThrow({ where: { email: SOURCE_EMAIL } });
  const target = await prisma.user.findUniqueOrThrow({ where: { email: TARGET_EMAIL } });

  const existingProgram = await prisma.program.findFirst({ where: { userId: target.id } });
  if (existingProgram) {
    throw new Error(`Target user already has program "${existingProgram.name}". Aborting to avoid duplicates.`);
  }

  const sourceOrg = await prisma.userOrganization.findFirst({ where: { userId: source.id } });
  if (sourceOrg) {
    await prisma.userOrganization.upsert({
      where: { userId_organizationId: { userId: target.id, organizationId: sourceOrg.organizationId } },
      create: { userId: target.id, organizationId: sourceOrg.organizationId, role: target.role },
      update: {}
    });
  }

  const foodIdMap = new Map<string, string>();
  const sourceFoods = await prisma.food.findMany({
    where: { ownerUserId: source.id },
    include: { aliases: true },
    orderBy: { createdAt: 'asc' }
  });

  for (const food of sourceFoods) {
    const newFood = await prisma.food.create({
      data: {
        name: food.name,
        brand: food.brand,
        servingSize: food.servingSize,
        servingUnit: food.servingUnit,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        sodium: food.sodium,
        source: food.source,
        visibility: food.visibility,
        aiGenerated: food.aiGenerated,
        verified: food.verified,
        ownerUserId: target.id,
        createdById: target.id,
        aliases: {
          create: food.aliases.map((alias) => ({ alias: alias.alias }))
        }
      }
    });
    foodIdMap.set(food.id, newFood.id);
  }

  const sourceProgram = await prisma.program.findFirstOrThrow({
    where: { userId: source.id },
    include: {
      metrics: true,
      metricSnapshots: { include: { values: true }, orderBy: { date: 'asc' } }
    }
  });

  const newProgram = await prisma.program.create({
    data: {
      userId: target.id,
      organizationId: sourceProgram.organizationId,
      coachId: sourceProgram.coachId,
      name: sourceProgram.name,
      status: sourceProgram.status,
      startDate: sourceProgram.startDate,
      targetEndDate: sourceProgram.targetEndDate,
      metrics: {
        create: sourceProgram.metrics.map((metric) => ({
          metricType: metric.metricType,
          startValue: metric.startValue,
          currentValue: metric.currentValue,
          goalValue: metric.goalValue,
          unit: metric.unit
        }))
      }
    }
  });

  for (const snapshot of sourceProgram.metricSnapshots) {
    await prisma.programMetricSnapshot.create({
      data: {
        programId: newProgram.id,
        date: snapshot.date,
        values: {
          create: snapshot.values.map((value) => ({
            metricType: value.metricType,
            currentValue: value.currentValue,
            unit: value.unit
          }))
        }
      }
    });
  }

  const mealItemIdMap = new Map<string, string>();
  const sourceLogs = await prisma.dailyLog.findMany({
    where: { userId: source.id },
    include: {
      meals: {
        include: { items: true },
        orderBy: { mealNumber: 'asc' }
      }
    },
    orderBy: { date: 'asc' }
  });

  for (const log of sourceLogs) {
    const newLog = await prisma.dailyLog.create({
      data: {
        programId: newProgram.id,
        userId: target.id,
        date: log.date,
        weight: log.weight,
        bodyFat: log.bodyFat,
        waist: log.waist,
        calorieTarget: log.calorieTarget,
        proteinTarget: log.proteinTarget,
        carbTarget: log.carbTarget,
        fatTarget: log.fatTarget,
        caloriesActual: log.caloriesActual,
        proteinActual: log.proteinActual,
        carbsActual: log.carbsActual,
        fatActual: log.fatActual,
        mealsPlanned: log.mealsPlanned,
        mealsCompleted: log.mealsCompleted,
        exercisesPlanned: log.exercisesPlanned,
        exercisesCompleted: log.exercisesCompleted,
        complianceScore: log.complianceScore,
        notes: log.notes
      }
    });

    for (const meal of log.meals) {
      const newMeal = await prisma.meal.create({
        data: {
          dailyLogId: newLog.id,
          userId: target.id,
          mealNumber: meal.mealNumber,
          name: meal.name,
          plannedTime: meal.plannedTime,
          status: meal.status,
          plannedCalories: meal.plannedCalories,
          plannedProtein: meal.plannedProtein,
          plannedCarbs: meal.plannedCarbs,
          plannedFat: meal.plannedFat,
          actualCalories: meal.actualCalories,
          actualProtein: meal.actualProtein,
          actualCarbs: meal.actualCarbs,
          actualFat: meal.actualFat
        }
      });

      for (const item of meal.items.filter((entry) => entry.type === MealItemType.PLANNED)) {
        const newItem = await prisma.mealItem.create({
          data: {
            mealId: newMeal.id,
            foodId: item.foodId ? foodIdMap.get(item.foodId) ?? item.foodId : null,
            type: item.type,
            nameSnapshot: item.nameSnapshot,
            quantity: item.quantity,
            unit: item.unit,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat
          }
        });
        mealItemIdMap.set(item.id, newItem.id);
      }

      for (const item of meal.items.filter((entry) => entry.type === MealItemType.ACTUAL)) {
        await prisma.mealItem.create({
          data: {
            mealId: newMeal.id,
            foodId: item.foodId ? foodIdMap.get(item.foodId) ?? item.foodId : null,
            type: item.type,
            linkedPlannedItemId: item.linkedPlannedItemId ? mealItemIdMap.get(item.linkedPlannedItemId) ?? null : null,
            nameSnapshot: item.nameSnapshot,
            quantity: item.quantity,
            unit: item.unit,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat
          }
        });
      }
    }
  }

  const sourceScheduledExercises = await prisma.scheduledExercise.findMany({
    where: { userId: source.id },
    include: { log: true },
    orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }]
  });

  for (const scheduled of sourceScheduledExercises) {
    const newScheduled = await prisma.scheduledExercise.create({
      data: {
        programId: newProgram.id,
        userId: target.id,
        exerciseId: scheduled.exerciseId,
        scheduledDate: scheduled.scheduledDate,
        sets: scheduled.sets,
        reps: scheduled.reps,
        durationSeconds: scheduled.durationSeconds,
        distance: scheduled.distance,
        weight: scheduled.weight,
        status: scheduled.status
      }
    });

    if (scheduled.log) {
      await prisma.exerciseLog.create({
        data: {
          scheduledExerciseId: newScheduled.id,
          userId: target.id,
          completed: scheduled.log.completed,
          completedAt: scheduled.log.completedAt,
          actualSets: scheduled.log.actualSets,
          actualReps: scheduled.log.actualReps,
          actualDurationSeconds: scheduled.log.actualDurationSeconds,
          actualDistance: scheduled.log.actualDistance,
          actualWeight: scheduled.log.actualWeight,
          difficulty: scheduled.log.difficulty,
          notes: scheduled.log.notes
        }
      });
    }
  }

  const sourceFoodLookups = await prisma.aiFoodLookup.findMany({ where: { userId: source.id }, orderBy: { createdAt: 'asc' } });
  for (const lookup of sourceFoodLookups) {
    await prisma.aiFoodLookup.create({
      data: {
        userId: target.id,
        inputText: lookup.inputText,
        normalizedFoodName: lookup.normalizedFoodName,
        calories: lookup.calories,
        protein: lookup.protein,
        carbs: lookup.carbs,
        fat: lookup.fat,
        confidence: lookup.confidence,
        accepted: lookup.accepted,
        foodId: lookup.foodId ? foodIdMap.get(lookup.foodId) ?? lookup.foodId : null
      }
    });
  }

  const sourceExerciseLookups = await prisma.aiExerciseLookup.findMany({ where: { userId: source.id }, orderBy: { createdAt: 'asc' } });
  for (const lookup of sourceExerciseLookups) {
    await prisma.aiExerciseLookup.create({
      data: {
        userId: target.id,
        inputText: lookup.inputText,
        name: lookup.name,
        description: lookup.description,
        category: lookup.category,
        bodyPart: lookup.bodyPart,
        defaultSets: lookup.defaultSets,
        defaultReps: lookup.defaultReps,
        defaultDurationSeconds: lookup.defaultDurationSeconds,
        confidence: lookup.confidence,
        accepted: lookup.accepted,
        exerciseId: lookup.exerciseId
      }
    });
  }

  const sourceMealTemplates = await prisma.mealTemplate.findMany({ where: { userId: source.id }, orderBy: { createdAt: 'asc' } });
  for (const template of sourceMealTemplates) {
    await prisma.mealTemplate.create({
      data: {
        userId: target.id,
        name: template.name,
        description: template.description,
        visibility: template.visibility
      }
    });
  }

  console.log(`Copied data from ${SOURCE_EMAIL} to ${TARGET_EMAIL}:`);
  console.log(`  foods: ${sourceFoods.length}`);
  console.log(`  program: ${newProgram.name}`);
  console.log(`  daily logs: ${sourceLogs.length}`);
  console.log(`  scheduled exercises: ${sourceScheduledExercises.length}`);
  console.log(`  ai food lookups: ${sourceFoodLookups.length}`);
  console.log(`  ai exercise lookups: ${sourceExerciseLookups.length}`);
  console.log(`  meal templates: ${sourceMealTemplates.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
