import { describe, expect, it } from 'vitest';
import { groupNutritionPlanOptions } from './nutritionPlanGroups';
import { nutritionPlanPickerOptions } from './nutritionPlanPicker';

const library = [
  plan('tall-high', '6\'2" Male · 2400 kcal', { gender: 'm', heightMinInches: 73, heightMaxInches: 75, calorieTarget: 2400 }),
  plan('tall-low', '6\'2" Male · 2175 kcal', { gender: 'm', heightMinInches: 73, heightMaxInches: 75, calorieTarget: 2175 }),
  plan('mid', '5\'8" Male · 1900 kcal', { gender: 'm', heightMinInches: 67, heightMaxInches: 69, calorieTarget: 1900 }),
  plan('short-a', '5\'4" Female · 1349 kcal', {
    gender: 'f',
    heightMinInches: 63,
    heightMaxInches: 65,
    calorieTarget: 1349,
    proteinTarget: 110,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }),
  plan('short-b', '5\'4" Female · 1349 kcal', {
    gender: 'f',
    heightMinInches: 63,
    heightMaxInches: 65,
    calorieTarget: 1349,
    proteinTarget: 140,
    updatedAt: '2026-02-01T00:00:00.000Z'
  }),
  plan('named', 'Balanced 2054', { calorieTarget: 2054, visibility: 'GLOBAL' }),
  plan('coach', 'Lean weekdays', { calorieTarget: 1800, visibility: 'USER' }),
  plan('assigned-custom', 'Desk lunches', { calorieTarget: 1600, visibility: 'USER' })
];

function plan(
  id: string,
  name: string,
  extra: Partial<{
    gender: string;
    heightMinInches: number;
    heightMaxInches: number;
    calorieTarget: number;
    proteinTarget: number;
    visibility: string;
    updatedAt: string;
    mealCount: number;
  }>
) {
  return {
    id,
    name,
    visibility: 'GLOBAL',
    ...extra
  };
}

describe('food plan groups', () => {
  it('groups library plans by body type and sorts each group by calories', () => {
    const groups = groupNutritionPlanOptions(library, null);
    expect(groups.map((group) => group.label)).toEqual([
      'Your templates',
      'Other plans',
      '6\'2" Male',
      '5\'8" Male',
      '5\'4" Female'
    ]);
    expect(groups.find((group) => group.label === '6\'2" Male')?.options.map((option) => option.label)).toEqual([
      '2175 kcal',
      '2400 kcal'
    ]);
    expect(groups.find((group) => group.label === 'Other plans')?.options.map((option) => option.label)).toEqual([
      'Balanced 2054'
    ]);
    expect(groups.find((group) => group.label === 'Your templates')?.options.map((option) => option.label)).toEqual([
      'Desk lunches',
      'Lean weekdays'
    ]);
  });

  it('keeps every listed plan and distinguishes identical body type and calories', () => {
    const groups = groupNutritionPlanOptions(library, null);
    const ids = groups.flatMap((group) => group.options.map((option) => option.id)).sort();
    expect(ids).toEqual(nutritionPlanPickerOptions(library, null).map((option) => option.id).sort());
    expect(groups.find((group) => group.label === '5\'4" Female')?.options.map((option) => option.label)).toEqual([
      '1349 kcal · 110g protein',
      '1349 kcal · 140g protein'
    ]);
    const labels = groups.flatMap((group) => group.options.map((option) => option.label));
    expect(labels.join(' ')).not.toMatch(/Amy|Tester/);
  });

  it('puts an assigned plan that is not a body type in its own group', () => {
    const groups = groupNutritionPlanOptions(library, { id: 'assigned-custom', name: 'Desk lunches' });
    expect(groups[0]).toMatchObject({
      label: 'Assigned to this client',
      options: [{ id: 'assigned-custom', label: 'Desk lunches' }]
    });
    expect(groups.find((group) => group.label === 'Your templates')?.options.map((option) => option.id)).toEqual([
      'coach'
    ]);
  });

  it('leaves an assigned body-type plan in that body-type group', () => {
    const groups = groupNutritionPlanOptions(library, { id: 'tall-low', name: '6\'2" Male · 2175 kcal' });
    expect(groups.map((group) => group.label)).not.toContain('Assigned to this client');
    expect(groups.find((group) => group.label === '6\'2" Male')?.options.map((option) => option.id)).toContain('tall-low');
  });

  it('reads body type from the plan name when criteria are missing', () => {
    const groups = groupNutritionPlanOptions(
      [
        { id: 'legacy', name: '5\'11" Male · 2000 kcal', calorieTarget: 2000, visibility: 'GLOBAL' },
        { id: 'copy', name: '5\'11" Male · 2000 kcal', calorieTarget: 2000, visibility: 'GLOBAL', updatedAt: '2026-03-01' }
      ],
      null
    );
    expect(groups.map((group) => group.label)).toEqual(['5\'11" Male']);
    expect(groups[0]?.options.map((option) => option.label)).toEqual(['2000 kcal · v1', '2000 kcal · v2']);
  });

  it('does not drop a plan the picker already included', () => {
    const assigned = { id: 'saved', name: 'Saved meals' };
    const listed = nutritionPlanPickerOptions([{ id: 'library', name: 'Band plan' }], assigned);
    const groups = groupNutritionPlanOptions([{ id: 'library', name: 'Band plan' }], assigned);
    expect(groups.flatMap((group) => group.options.map((option) => option.id))).toEqual(listed.map((option) => option.id));
  });
});
