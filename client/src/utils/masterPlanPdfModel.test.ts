import { describe, expect, it } from 'vitest';
import { formatPlanShort } from './exerciseFormat';
import {
  buildMasterPlanDocument,
  buildReminders,
  buildSubstitutions,
  masterPlanHasContent,
  masterPlanPdfFilename,
  masterPlanTitle,
  trackerNotesText,
  type MasterPlanWeekInput
} from './masterPlanPdfModel';

const squat = { name: 'Goblet squat', sets: 3, reps: '10', weight: 25, speed: '1/2' };
const row = { name: 'Bent-over row', sets: 3, reps: '12' };
const walk = { name: 'Incline walk', durationSeconds: 30 * 60 };

function meal(mealNumber: number, name: string, foods: Array<[number, string, string]>) {
  return {
    mealNumber,
    name,
    items: foods.map(([quantity, unit, nameSnapshot]) => ({
      type: 'PLANNED' as const,
      quantity,
      unit,
      nameSnapshot
    }))
  };
}

function breakfast(foods: Array<[number, string, string]> = [[6, 'oz', 'egg whites'], [0.5, 'cup', 'oats']]) {
  return meal(1, 'Breakfast', foods);
}

const weekdayMeals = [
  breakfast(),
  meal(2, 'Snack', [[1, 'scoop', 'whey protein']]),
  meal(3, 'Lunch', [[5, 'oz', 'chicken breast'], [1, 'cup', 'rice']]),
  meal(4, 'Dinner', [[5, 'oz', 'salmon'], [1, 'medium', 'sweet potato']])
];

function week(startDate: string, weekNumber: number, days?: MasterPlanWeekInput['days']): MasterPlanWeekInput {
  return {
    weekNumber,
    startDate,
    days: days ?? [
      { date: startDate, meals: weekdayMeals, exercises: [squat, row] },
      { date: addDays(startDate, 1), meals: weekdayMeals, exercises: [walk] },
      { date: addDays(startDate, 2), meals: weekdayMeals, exercises: [squat] },
      { date: addDays(startDate, 3), meals: weekdayMeals, exercises: [] },
      { date: addDays(startDate, 4), meals: weekdayMeals, exercises: [row, walk] },
      { date: addDays(startDate, 5), meals: weekdayMeals, exercises: [walk] },
      { date: addDays(startDate, 6), meals: weekdayMeals, exercises: [] }
    ]
  };
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

describe('master plan PDF mapping', () => {
  it('builds one page per week with the Mona header', () => {
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'horizontal',
      waterGoalOz: 80,
      weeks: [week('2026-10-05', 4), week('2026-10-12', 5)]
    });

    expect(doc.weeks).toHaveLength(2);
    expect(doc.weeks[0]?.title).toBe("Week 4 Jordan Hale's Master Metabolic Plan");
    expect(doc.weeks[1]?.title).toBe("Week 5 Jordan Hale's Master Metabolic Plan");
    expect(doc.weeks[0]?.weekOfLabel).toBe('Week of October 5, 2026');
    expect(doc.weeks[0]?.waterGoalLabel).toBe('Water goal 80 oz');
    expect(masterPlanTitle(null, 'Jordan Hale')).toBe("Jordan Hale's Master Metabolic Plan");
    expect(masterPlanPdfFilename('Jordan Hale')).toBe('jordan-hale-master-metabolic-plan.pdf');
  });

  it('fills a Monday-Sunday tracker and leaves Notes blank', () => {
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'vertical',
      waterGoalOz: 64,
      weeks: [week('2026-10-05', 4, [{ date: '2026-10-05', meals: weekdayMeals, exercises: [squat] }])]
    });
    const tracker = doc.weeks[0]!.tracker;
    expect(tracker.map((row) => row.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(tracker.every((row) => row.notes === '')).toBe(true);
    expect(tracker[0]?.exercise).toBe('A');
    expect(tracker[1]?.exercise).toBe('Rest');
  });

  it('maps an exercise key and the day-by-day exercise plan', () => {
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'vertical',
      waterGoalOz: 80,
      weeks: [week('2026-10-05', 4)]
    });
    const page = doc.weeks[0]!;
    expect(page.exerciseKey.map((entry) => entry.key)).toEqual(['A', 'B', 'C']);
    expect(page.exerciseKey[0]).toMatchObject({ name: 'Goblet squat', prescription: formatPlanShort(squat) });
    expect(page.exercisePlan[0]?.line.startsWith('A Goblet squat')).toBe(true);
    expect(page.exercisePlan[3]?.line).toBe('Rest');
    expect(page.exercisePlan[4]?.line).toContain('B Bent-over row');
    expect(page.exercisePlan[4]?.line).toContain('C Incline walk');
  });

  it('lays meals out as four portion columns or a vertical list', () => {
    const horizontal = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'horizontal',
      waterGoalOz: 80,
      weeks: [week('2026-10-05', 4)]
    });
    const vertical = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'vertical',
      waterGoalOz: 80,
      weeks: [week('2026-10-05', 4)]
    });

    expect(horizontal.layout).toBe('horizontal');
    expect(horizontal.weeks[0]?.meals.layout).toBe('horizontal');
    expect(vertical.weeks[0]?.meals.layout).toBe('vertical');
    expect(horizontal.weeks[0]?.meals.slots.map((slot) => slot.title)).toEqual([
      'Meal 1 - Breakfast',
      'Meal 2 - Snack',
      'Meal 3 - Lunch',
      'Meal 4 - Dinner'
    ]);
    expect(horizontal.weeks[0]?.meals.slots[0]?.groups).toEqual([
      { label: null, lines: ['6 oz egg whites', '0.5 cup oats'] }
    ]);
    expect(vertical.weeks[0]?.meals.slots[2]?.groups[0]?.lines).toContain('5 oz chicken breast');
  });

  it('splits a meal column when a day differs and ignores logged foods', () => {
    const meals = weekdayMeals.map((slot) => ({
      ...slot,
      items: [
        ...(slot.items ?? []),
        { type: 'ACTUAL' as const, quantity: 2, unit: 'cookie', nameSnapshot: 'cookie' }
      ]
    }));
    const sunday = [
      breakfast([[4, 'oz', 'egg whites']]),
      meal(2, 'Snack', [[1, 'scoop', 'whey protein']]),
      meal(3, 'Lunch', [[5, 'oz', 'chicken breast']]),
      meal(4, 'Dinner', [[5, 'oz', 'salmon']])
    ];
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'horizontal',
      waterGoalOz: 80,
      weeks: [
        week(
          '2026-10-05',
          4,
          Array.from({ length: 7 }, (_, index) => ({
            date: addDays('2026-10-05', index),
            meals: index === 6 ? sunday : meals,
            exercises: []
          }))
        )
      ]
    });
    const breakfastSlot = doc.weeks[0]?.meals.slots[0];
    expect(breakfastSlot?.groups.map((group) => group.label)).toEqual(['Mon, Tue, Wed, Thu, Fri, Sat', 'Sun']);
    expect(breakfastSlot?.groups[0]?.lines).toEqual(['6 oz egg whites', '0.5 cup oats']);
    expect(breakfastSlot?.groups[0]?.lines.join(' ')).not.toContain('cookie');
    expect(breakfastSlot?.groups[1]?.lines).toEqual(['4 oz egg whites']);
  });

  it('keeps a fifth meal without depending on a notes schema', () => {
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'vertical',
      waterGoalOz: 80,
      weeks: [
        week('2026-10-05', 4, [
          {
            date: '2026-10-05',
            meals: [...weekdayMeals, meal(5, 'Evening', [[1, 'cup', 'cottage cheese']])],
            exercises: []
          }
        ])
      ]
    });
    expect(doc.weeks[0]?.meals.slots[4]?.title).toBe('Meal 5 - Evening');
    expect(doc.weeks[0]?.meals.slots[4]?.groups[0]?.lines).toEqual(['1 cup cottage cheese']);
  });

  it('fills tracker notes only through the optional notes hook', () => {
    expect(trackerNotesText(null)).toBe('');
    expect(trackerNotesText({})).toBe('');
    expect(trackerNotesText({ dayNote: '  slept late  ' })).toBe('slept late');
    expect(
      trackerNotesText({
        dayNote: 'ignored when meals exist',
        mealNotes: [
          { mealNumber: 1, text: ' eggs were fine ' },
          { mealNumber: 2, text: '   ' },
          { mealNumber: 3, text: 'smaller rice' }
        ]
      })
    ).toBe('Meal 1: eggs were fine | Meal 3: smaller rice');

    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'vertical',
      waterGoalOz: 80,
      weeks: [
        week('2026-10-05', 4, [
          {
            date: '2026-10-05',
            meals: weekdayMeals,
            exercises: [],
            notes: { mealNotes: [{ mealNumber: 2, text: 'held the snack' }] }
          }
        ])
      ]
    });
    expect(doc.weeks[0]?.tracker[0]?.notes).toBe('Meal 2: held the snack');
    expect(doc.weeks[0]?.tracker[1]?.notes).toBe('');
  });

  it('builds substitutions from the plan description and reminders from the water goal', () => {
    expect(
      buildSubstitutions({
        planDescription: 'Meat substitutions: chicken, turkey, white fish.\nStarch Subs: rice, potato.',
        dietaryPreferences: 'No pork'
      })
    ).toEqual(['Meat: chicken, turkey, white fish.', 'Starch: rice, potato.', 'No pork']);
    expect(buildSubstitutions({})[0]).toMatch(/Protein:/);
    expect(buildReminders(80, 'shellfish')).toEqual([
      'Allergies: shellfish',
      'Water goal 80 oz. Write the ounces you drink in the tracker.',
      'Record sleep hours in the Sleep column.',
      'Measure portions as written and check off each meal.'
    ]);

    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'horizontal',
      waterGoalOz: 80,
      foodAllergies: 'shellfish',
      planDescription: 'Meat substitutions: chicken or turkey.',
      weeks: [week('2026-10-05', 4)]
    });
    expect(doc.weeks[0]?.substitutions).toEqual(['Meat: chicken or turkey.']);
    expect(doc.weeks[0]?.reminders[0]).toBe('Allergies: shellfish');
    expect(masterPlanHasContent(doc)).toBe(true);
  });

  it('reports an empty plan', () => {
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'vertical',
      waterGoalOz: 64,
      weeks: [week('2026-10-05', 4, [])]
    });
    expect(masterPlanHasContent(doc)).toBe(false);
    expect(doc.weeks[0]?.tracker).toHaveLength(7);
  });
});
