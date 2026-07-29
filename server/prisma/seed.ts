import { PrismaClient, MealItemType, MealStatus, ProgramStatus, Role, UserStatus } from '@prisma/client';
import { startOfUtcDay } from '../src/utils/dates.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.smsMessage.deleteMany();
  await prisma.aiFoodLookup.deleteMany();
  await prisma.exerciseLog.deleteMany();
  await prisma.scheduledExercise.deleteMany();
  await prisma.program.updateMany({ data: { defaultNutritionTemplateId: null, defaultExerciseTemplateId: null } });
  await prisma.exerciseTemplate.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.mealItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.dailyLog.deleteMany();
  await prisma.programMetric.deleteMany();
  await prisma.nutritionPlanTemplate.deleteMany();
  await prisma.program.deleteMany();
  await prisma.foodAlias.deleteMany();
  await prisma.food.deleteMany();
  await prisma.coachAssignment.deleteMany();
  await prisma.userOrganization.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({ data: { firebaseUid: 'seed-super-admin', email: 'admin@metabolic.local', firstName: 'Metabolic', lastName: 'Admin', phone: '+15550000001', role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE } });
  const user = await prisma.user.create({ data: { firebaseUid: 'seed-user', email: 'user@metabolic.local', firstName: 'Jordan', lastName: 'Rivera', phone: '+15550000002', role: Role.ADMIN, status: UserStatus.ACTIVE } });
  const org = await prisma.organization.create({ data: { name: 'Metabolic HQ' } });
  await prisma.userOrganization.createMany({ data: [{ userId: admin.id, organizationId: org.id, role: Role.SUPER_ADMIN }, { userId: user.id, organizationId: org.id, role: Role.ADMIN }] });

  const foods = await Promise.all([
    ['Chicken breast', 6, 'oz', 280, 52, 0, 6, ['grilled chicken', 'chicken'] ],
    ['White rice', 1, 'cup', 205, 4, 45, 0, ['rice'] ],
    ['Greek yogurt', 1, 'cup', 140, 24, 8, 0, ['yogurt'] ],
    ['Blueberries', 1, 'cup', 85, 1, 21, 0, ['berries'] ],
    ['Eggs', 2, 'each', 140, 12, 1, 10, ['egg'] ],
    ['Salmon', 6, 'oz', 360, 39, 0, 22, ['fish'] ],
    ['Sweet potato', 1, 'medium', 112, 2, 26, 0, ['potato'] ],
    ['Whey protein', 1, 'scoop', 120, 25, 3, 2, ['protein shake'] ],
    ['Avocado', 0.5, 'each', 160, 2, 9, 15, ['avocado'] ],
    ['Banana', 1, 'each', 105, 1, 27, 0, ['banana'] ]
  ].map(async ([name, servingSize, servingUnit, calories, protein, carbs, fat, aliases]) => {
    const food = await prisma.food.create({ data: { name: String(name), servingSize: Number(servingSize), servingUnit: String(servingUnit), calories: Number(calories), protein: Number(protein), carbs: Number(carbs), fat: Number(fat), visibility: 'GLOBAL', source: 'VERIFIED', verified: true, createdById: admin.id } });
    await prisma.foodAlias.createMany({ data: (aliases as string[]).map((alias) => ({ foodId: food.id, alias })) });
    return food;
  }));

  const today = startOfUtcDay();
  const program = await prisma.program.create({ data: { userId: user.id, organizationId: org.id, name: 'Metabolic Reset', status: ProgramStatus.ACTIVE, startDate: today, targetEndDate: new Date(today.getTime() + 16 * 7 * 86400000) } });
  await prisma.programMetric.createMany({ data: [
    { programId: program.id, metricType: 'WEIGHT', startValue: 230.00, currentValue: 230.00, goalValue: 163.76, unit: 'lbs' },
    { programId: program.id, metricType: 'BODY_FAT', startValue: 46.00, currentValue: 46.00, goalValue: 15.00, unit: '%' },
    { programId: program.id, metricType: 'LEAN_TISSUE_MASS', startValue: 124.20, currentValue: 124.20, goalValue: 139.20, unit: 'lbs' },
    { programId: program.id, metricType: 'FAT_MASS', startValue: 105.80, currentValue: 105.80, goalValue: 24.56, unit: 'lbs' },
    { programId: program.id, metricType: 'CALORIES', startValue: 2200, currentValue: 2200, goalValue: 2050, unit: 'kcal' },
    { programId: program.id, metricType: 'PROTEIN', startValue: 190, currentValue: 190, goalValue: 205, unit: 'g' }
  ] });

  const log = await prisma.dailyLog.create({ data: { programId: program.id, userId: user.id, date: today, weight: 230, bodyFat: 46, waist: 42, calorieTarget: 2200, proteinTarget: 190, carbTarget: 190, fatTarget: 70, mealsPlanned: 5, exercisesPlanned: 4 } });
  const mealDefs = [
    [1, 'Breakfast', '07:30', [foods[4], foods[3]], MealStatus.EATEN_AS_PLANNED],
    [2, 'Snack', '10:30', [foods[2]], MealStatus.PLANNED],
    [3, 'Lunch', '12:30', [foods[0], foods[1]], MealStatus.MODIFIED],
    [4, 'Snack', '15:30', [foods[7], foods[9]], MealStatus.UPCOMING],
    [5, 'Dinner', '18:30', [foods[5], foods[6], foods[8]], MealStatus.PLANNED]
  ] as const;
  for (const [mealNumber, name, plannedTime, mealFoods, status] of mealDefs) {
    const plannedCalories = mealFoods.reduce((s, f) => s + Number(f.calories), 0);
    const plannedProtein = mealFoods.reduce((s, f) => s + Number(f.protein), 0);
    const plannedCarbs = mealFoods.reduce((s, f) => s + Number(f.carbs), 0);
    const plannedFat = mealFoods.reduce((s, f) => s + Number(f.fat), 0);
    const meal = await prisma.meal.create({ data: { dailyLogId: log.id, userId: user.id, mealNumber, name, plannedTime, status, plannedCalories, plannedProtein, plannedCarbs, plannedFat, actualCalories: status === MealStatus.PLANNED || status === MealStatus.UPCOMING ? 0 : plannedCalories, actualProtein: status === MealStatus.PLANNED || status === MealStatus.UPCOMING ? 0 : plannedProtein, actualCarbs: status === MealStatus.PLANNED || status === MealStatus.UPCOMING ? 0 : plannedCarbs, actualFat: status === MealStatus.PLANNED || status === MealStatus.UPCOMING ? 0 : plannedFat } });
    await prisma.mealItem.createMany({ data: mealFoods.map((food) => ({ mealId: meal.id, foodId: food.id, type: MealItemType.PLANNED, nameSnapshot: food.name, quantity: 1, unit: food.servingUnit, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat })) });
    if (status === MealStatus.EATEN_AS_PLANNED || status === MealStatus.MODIFIED) {
      await prisma.mealItem.createMany({ data: mealFoods.map((food) => ({ mealId: meal.id, foodId: food.id, type: MealItemType.ACTUAL, nameSnapshot: food.name, quantity: 1, unit: food.servingUnit, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat })) });
    }
  }

  const exercises = await Promise.all([
    prisma.exercise.create({ data: { name: 'Morning walk', category: 'Cardio', defaultDurationMinutes: 30 } }),
    prisma.exercise.create({ data: { name: 'Goblet squat', category: 'Strength', bodyPart: 'Legs', defaultSets: 3, defaultReps: 10 } }),
    prisma.exercise.create({ data: { name: 'Push-up', category: 'Strength', bodyPart: 'Chest', defaultSets: 3, defaultReps: 8 } }),
    prisma.exercise.create({ data: { name: 'Mobility flow', category: 'Recovery', defaultDurationMinutes: 15 } })
  ]);
  for (const [index, exercise] of exercises.entries()) {
    const scheduled = await prisma.scheduledExercise.create({
      data: {
        programId: program.id,
        userId: user.id,
        exerciseId: exercise.id,
        scheduledDate: today,
        sets: exercise.defaultSets,
        reps: exercise.defaultReps == null ? null : String(exercise.defaultReps),
        durationMinutes: exercise.defaultDurationMinutes,
        status: index === 0 ? 'DONE' : 'PLANNED',
        sortOrder: index
      }
    });
    if (index === 0) await prisma.exerciseLog.create({ data: { scheduledExerciseId: scheduled.id, userId: user.id, completed: true, completedAt: new Date(), actualDurationMinutes: 30, difficulty: 'NORMAL' } });
  }

  await prisma.dailyLog.update({ where: { id: log.id }, data: { caloriesActual: 710, proteinActual: 69, carbsActual: 67, fatActual: 16, mealsCompleted: 2, exercisesCompleted: 1, complianceScore: 33 } });
  await prisma.programTemplate.create({ data: { name: 'Fat Loss Foundation', description: 'Balanced macro plan with five meals and daily movement.', defaultCalories: 2200, defaultProtein: 190, defaultCarbs: 190, defaultFat: 70, defaultMealCount: 5 } });
  await prisma.mealTemplate.create({ data: { userId: user.id, name: 'Chicken and Rice Lunch', description: 'Simple high-protein lunch template.' } });

  await prisma.exerciseTemplate.create({
    data: {
      name: 'Daily Movement Checklist',
      description: 'Walk, squat, push, mobility.',
      visibility: 'GLOBAL',
      createdById: admin.id,
      items: {
        create: exercises.map((exercise, index) => ({
          exerciseId: exercise.id,
          sortOrder: index,
          sets: exercise.defaultSets,
          reps: exercise.defaultReps == null ? null : String(exercise.defaultReps),
          durationMinutes: exercise.defaultDurationMinutes
        }))
      }
    }
  });

  await prisma.exerciseTemplate.create({
    data: {
      name: 'Strength Focus',
      description: 'Strength-heavy day with a cardio finisher.',
      visibility: 'GLOBAL',
      createdById: admin.id,
      items: {
        create: [
          { exerciseId: exercises[1].id, sortOrder: 0, sets: 4, reps: '8' },
          { exerciseId: exercises[2].id, sortOrder: 1, sets: 4, reps: '10' },
          { exerciseId: exercises[0].id, sortOrder: 2, durationMinutes: 20 }
        ]
      }
    }
  });

  await prisma.nutritionPlanTemplate.create({
    data: {
      name: 'Balanced 2200',
      description: 'Moderate calorie plan with five balanced meals.',
      visibility: 'GLOBAL',
      calorieTarget: 2200,
      proteinTarget: 190,
      carbTarget: 190,
      fatTarget: 70,
      createdById: admin.id,
      meals: {
        create: [
          {
            mealNumber: 1,
            name: 'Breakfast',
            plannedTime: '07:30',
            items: { create: [{ foodId: foods[4].id, nameSnapshot: foods[4].name, quantity: 1, unit: foods[4].servingUnit, calories: foods[4].calories, protein: foods[4].protein, carbs: foods[4].carbs, fat: foods[4].fat }, { foodId: foods[3].id, nameSnapshot: foods[3].name, quantity: 1, unit: foods[3].servingUnit, calories: foods[3].calories, protein: foods[3].protein, carbs: foods[3].carbs, fat: foods[3].fat }] }
          },
          {
            mealNumber: 2,
            name: 'Snack',
            plannedTime: '10:30',
            items: { create: [{ foodId: foods[2].id, nameSnapshot: foods[2].name, quantity: 1, unit: foods[2].servingUnit, calories: foods[2].calories, protein: foods[2].protein, carbs: foods[2].carbs, fat: foods[2].fat }] }
          },
          {
            mealNumber: 3,
            name: 'Lunch',
            plannedTime: '12:30',
            items: { create: [{ foodId: foods[0].id, nameSnapshot: foods[0].name, quantity: 1, unit: foods[0].servingUnit, calories: foods[0].calories, protein: foods[0].protein, carbs: foods[0].carbs, fat: foods[0].fat }, { foodId: foods[1].id, nameSnapshot: foods[1].name, quantity: 1, unit: foods[1].servingUnit, calories: foods[1].calories, protein: foods[1].protein, carbs: foods[1].carbs, fat: foods[1].fat }] }
          },
          { mealNumber: 4, name: 'Snack', plannedTime: '15:30', items: { create: [{ foodId: foods[7].id, nameSnapshot: foods[7].name, quantity: 1, unit: foods[7].servingUnit, calories: foods[7].calories, protein: foods[7].protein, carbs: foods[7].carbs, fat: foods[7].fat }] } },
          {
            mealNumber: 5,
            name: 'Dinner',
            plannedTime: '18:30',
            items: { create: [{ foodId: foods[5].id, nameSnapshot: foods[5].name, quantity: 1, unit: foods[5].servingUnit, calories: foods[5].calories, protein: foods[5].protein, carbs: foods[5].carbs, fat: foods[5].fat }, { foodId: foods[6].id, nameSnapshot: foods[6].name, quantity: 1, unit: foods[6].servingUnit, calories: foods[6].calories, protein: foods[6].protein, carbs: foods[6].carbs, fat: foods[6].fat }] }
          }
        ]
      }
    }
  });

  await prisma.nutritionPlanTemplate.create({
    data: {
      name: 'High Protein Cut',
      description: 'Higher protein targets with lean meals throughout the day.',
      visibility: 'GLOBAL',
      calorieTarget: 2050,
      proteinTarget: 205,
      carbTarget: 160,
      fatTarget: 65,
      createdById: admin.id,
      meals: {
        create: [
          { mealNumber: 1, name: 'Breakfast', plannedTime: '07:30', items: { create: [{ foodId: foods[4].id, nameSnapshot: foods[4].name, quantity: 2, unit: foods[4].servingUnit, calories: Number(foods[4].calories) * 2, protein: Number(foods[4].protein) * 2, carbs: Number(foods[4].carbs) * 2, fat: Number(foods[4].fat) * 2 }] } },
          { mealNumber: 2, name: 'Snack', plannedTime: '10:30', items: { create: [{ foodId: foods[7].id, nameSnapshot: foods[7].name, quantity: 1, unit: foods[7].servingUnit, calories: foods[7].calories, protein: foods[7].protein, carbs: foods[7].carbs, fat: foods[7].fat }] } },
          { mealNumber: 3, name: 'Lunch', plannedTime: '12:30', items: { create: [{ foodId: foods[0].id, nameSnapshot: foods[0].name, quantity: 1.5, unit: foods[0].servingUnit, calories: Number(foods[0].calories) * 1.5, protein: Number(foods[0].protein) * 1.5, carbs: Number(foods[0].carbs) * 1.5, fat: Number(foods[0].fat) * 1.5 }] } },
          { mealNumber: 4, name: 'Snack', plannedTime: '15:30', items: { create: [{ foodId: foods[2].id, nameSnapshot: foods[2].name, quantity: 1, unit: foods[2].servingUnit, calories: foods[2].calories, protein: foods[2].protein, carbs: foods[2].carbs, fat: foods[2].fat }] } },
          { mealNumber: 5, name: 'Dinner', plannedTime: '18:30', items: { create: [{ foodId: foods[5].id, nameSnapshot: foods[5].name, quantity: 1, unit: foods[5].servingUnit, calories: foods[5].calories, protein: foods[5].protein, carbs: foods[5].carbs, fat: foods[5].fat }] } }
        ]
      }
    }
  });
}

main().finally(async () => prisma.$disconnect());
