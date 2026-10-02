import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildMasterPlanPdf } from '../src/utils/masterPlanPdf.ts';
import { buildMasterPlanDocument, type MasterPlanDayInput, type MasterPlanWeekInput } from '../src/utils/masterPlanPdfModel.ts';

const logo = readFileSync(new URL('../public/logo.png', import.meta.url));

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

const breakfast = [
  [6, 'oz', 'egg whites'],
  [0.5, 'cup', 'oats'],
  [1, 'cup', 'berries'],
  [1, 'tbsp', 'almond butter']
] as const;
const snack = [
  [1, 'scoop', 'whey protein'],
  [1, 'medium', 'apple']
] as const;
const lunch = [
  [5, 'oz', 'chicken breast'],
  [1, 'cup', 'jasmine rice'],
  [2, 'cups', 'broccoli'],
  [1, 'tbsp', 'olive oil']
] as const;
const dinner = [
  [5, 'oz', 'salmon'],
  [1, 'medium', 'sweet potato'],
  [2, 'cups', 'spinach'],
  [1, 'tsp', 'olive oil']
] as const;

function foods(lines: ReadonlyArray<readonly [number, string, string]>, name: string, mealNumber: number) {
  return {
    mealNumber,
    name,
    items: lines.map(([quantity, unit, nameSnapshot]) => ({
      type: 'PLANNED' as const,
      quantity,
      unit,
      nameSnapshot
    }))
  };
}

function dayMeals(chickenOz: number, salmonOz: number) {
  return [
    foods(breakfast, 'Breakfast', 1),
    foods(snack, 'Snack', 2),
    foods(
      lunch.map((line) => (line[2] === 'chicken breast' ? ([chickenOz, line[1], line[2]] as const) : line)),
      'Lunch',
      3
    ),
    foods(
      dinner.map((line) => (line[2] === 'salmon' ? ([salmonOz, line[1], line[2]] as const) : line)),
      'Dinner',
      4
    )
  ];
}

function buildWeek(startDate: string, weekNumber: number, chickenOz: number, salmonOz: number, squatWeight: number): MasterPlanWeekInput {
  const meals = dayMeals(chickenOz, salmonOz);
  const plan: Array<MasterPlanDayInput['exercises']> = [
    [
      { name: 'Goblet squat', sets: 3, reps: '10', weight: squatWeight, speed: '1/2' },
      { name: 'Bent-over row', sets: 3, reps: '12', weight: 30 }
    ],
    [{ name: 'Incline walk', durationSeconds: 30 * 60 }],
    [
      { name: 'Dumbbell press', sets: 3, reps: '10', weight: 20, speed: '1/2' },
      { name: 'Plank', durationSeconds: 45 }
    ],
    [],
    [
      { name: 'Romanian deadlift', sets: 3, reps: '8', weight: 40, speed: '1/3' },
      { name: 'Incline walk', durationSeconds: 20 * 60 }
    ],
    [{ name: 'Incline walk', durationSeconds: 30 * 60 }],
    []
  ];

  const days: MasterPlanDayInput[] = plan.map((exercises, index) => ({
    date: addDays(startDate, index),
    meals,
    exercises
  }));

  return { weekNumber, startDate, days };
}

const shared = {
  clientName: 'Jordan Hale',
  waterGoalOz: 80,
  planDescription: 'Meat substitutions: chicken, turkey, white fish, 96% lean beef.\nStarch substitutions: rice, potato, oats, fruit.',
  weeks: [buildWeek('2026-10-05', 4, 5, 5, 25), buildWeek('2026-10-12', 5, 6, 6, 30)]
};

const outDir = '/opt/cursor/artifacts';
mkdirSync(outDir, { recursive: true });

const vertical = buildMasterPlanDocument({ ...shared, layout: 'vertical' });
const horizontal = buildMasterPlanDocument({ ...shared, layout: 'horizontal' });
const verticalPdf = await buildMasterPlanPdf(vertical, { logoPng: logo });
const horizontalPdf = await buildMasterPlanPdf(horizontal, { logoPng: logo });

writeFileSync(`${outDir}/metabolic-plan-pdf-vertical.pdf`, verticalPdf);
writeFileSync(`${outDir}/metabolic-plan-pdf-sample.pdf`, verticalPdf);
writeFileSync(`${outDir}/metabolic-plan-pdf-horizontal.pdf`, horizontalPdf);
console.log('wrote sample, vertical, and horizontal PDFs');
