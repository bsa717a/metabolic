import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  annotateSuggestion,
  expandAvoidTerms,
  parseAvoidTerms,
  suggestionTotals,
  violatesAvoidList,
  withinDrift
} from './mealRecommendationService.js';
import type { ItemizedMealSuggestion } from './aiService.js';

function meal(items: Array<Partial<ItemizedMealSuggestion['items'][number]> & { name: string }>): ItemizedMealSuggestion {
  return {
    name: 'Test Meal',
    description: 'test',
    items: items.map((item) => ({
      quantity: 1,
      unit: 'serving',
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 3,
      role: 'PROTEIN' as const,
      ...item
    }))
  };
}

describe('parseAvoidTerms', () => {
  it('splits free-text conditions into lowercase terms', () => {
    assert.deepEqual(parseAvoidTerms('Shellfish, no pork; peanuts and tree nuts'), [
      'shellfish',
      'pork',
      'peanuts',
      'tree nuts'
    ]);
  });

  it('strips filler words and ignores short/none values', () => {
    assert.deepEqual(parseAvoidTerms('allergic to shrimp, none'), ['shrimp']);
    assert.deepEqual(parseAvoidTerms(null), []);
    assert.deepEqual(parseAvoidTerms(''), []);
  });
});

describe('violatesAvoidList', () => {
  const shrimpTacos = meal([{ name: 'Grilled shrimp' }, { name: 'Corn tortillas' }]);

  it('catches allergens in item names regardless of case', () => {
    assert.equal(violatesAvoidList(shrimpTacos, ['shrimp']), true);
    assert.equal(violatesAvoidList(shrimpTacos, ['peanut']), false);
  });

  it('catches allergens in the meal name', () => {
    const named = { ...meal([{ name: 'Mystery protein' }]), name: 'Peanut Noodle Bowl' };
    assert.equal(violatesAvoidList(named, ['peanut']), true);
  });

  it('passes everything when there are no restrictions', () => {
    assert.equal(violatesAvoidList(shrimpTacos, []), false);
  });

  it('does not match avoid terms as substrings inside other words', () => {
    const vegPlate = meal([{ name: 'Roasted vegetables' }, { name: 'Quinoa' }]);
    assert.equal(violatesAvoidList(vegPlate, ['egg']), false);
  });
});

describe('totals, band, and drift', () => {
  const suggestion = meal([
    { name: 'Chicken', calories: 200, protein: 30, role: 'PROTEIN' },
    { name: 'Rice', calories: 160, protein: 3, role: 'CARB' },
    { name: 'Broccoli', calories: 40, protein: 3, role: 'VEGETABLE' }
  ]);

  it('sums item macros', () => {
    assert.equal(suggestionTotals(suggestion).calories, 400);
    assert.equal(suggestionTotals(suggestion).protein, 36);
  });

  it('annotates band and blood-sugar coverage', () => {
    const annotated = annotateSuggestion(suggestion, 400);
    assert.equal(annotated.withinBand, true);
    assert.equal(annotated.bloodSugarStable, true);

    const offTarget = annotateSuggestion(suggestion, 600);
    assert.equal(offTarget.withinBand, false);

    const noVeg = annotateSuggestion(meal([{ name: 'Chicken', role: 'PROTEIN' }, { name: 'Rice', role: 'CARB' }]), 200);
    assert.equal(noVeg.bloodSugarStable, false);
  });

  it('drops only wildly-off options via drift', () => {
    assert.equal(withinDrift(suggestion, 400), true);
    assert.equal(withinDrift(suggestion, 500), true); // 20% under — kept, badge warns
    assert.equal(withinDrift(suggestion, 900), false); // >35% off — junk, dropped
    assert.equal(withinDrift(suggestion, 0), true); // no target → keep
  });
});

describe('allergen category expansion — the "nut allergy but almonds got through" case', () => {
  it('nut allergy blocks every concrete nut, not just the word "nut"', () => {
    const terms = expandAvoidTerms(parseAvoidTerms('nut allergy'));
    for (const meal of [
      [{ name: 'Almonds' }],
      [{ name: 'Peanut Butter' }],
      [{ name: 'Walnuts, raw' }],
      [{ name: 'Cashew stir-fry sauce' }],
      [{ name: 'Pistachios' }]
    ]) {
      const suggestion = { name: 'Snack Plate', description: 'test', items: meal.map((m) => ({ ...m, quantity: 1, unit: 'oz', calories: 100, protein: 4, carbs: 4, fat: 8, role: 'FAT' as const })) };
      if (!violatesAvoidList(suggestion, terms)) throw new Error(`MISSED: ${meal[0].name}`);
    }
  });

  it('catches allergens hiding in the meal description', () => {
    const terms = expandAvoidTerms(parseAvoidTerms('tree nuts'));
    const suggestion = {
      name: 'Green Beans Amandine',
      description: 'Green beans with toasted almond slivers.',
      items: [{ name: 'Green beans', quantity: 1, unit: 'cup', calories: 40, protein: 2, carbs: 8, fat: 0, role: 'VEGETABLE' as const }]
    };
    assert.equal(violatesAvoidList(suggestion, terms), true);
  });

  it('expands other categories: shellfish, dairy, gluten', () => {
    assert.equal(violatesAvoidList(
      { name: 'Garlic Shrimp', description: '', items: [{ name: 'Shrimp', quantity: 4, unit: 'oz', calories: 120, protein: 24, carbs: 0, fat: 2, role: 'PROTEIN' as const }] },
      expandAvoidTerms(parseAvoidTerms('shellfish allergy'))
    ), true);
    assert.equal(violatesAvoidList(
      { name: 'Parfait', description: '', items: [{ name: 'Greek yogurt', quantity: 1, unit: 'cup', calories: 130, protein: 22, carbs: 8, fat: 0, role: 'PROTEIN' as const }] },
      expandAvoidTerms(parseAvoidTerms('dairy intolerance'))
    ), true);
    assert.equal(violatesAvoidList(
      { name: 'Turkey Sandwich', description: '', items: [{ name: 'Whole wheat bread', quantity: 2, unit: 'slice', calories: 160, protein: 8, carbs: 28, fat: 2, role: 'CARB' as const }] },
      expandAvoidTerms(parseAvoidTerms('gluten'))
    ), true);
  });

  it('does not over-block unrelated meals', () => {
    const terms = expandAvoidTerms(parseAvoidTerms('nut allergy'));
    const clean = {
      name: 'Grilled Chicken Bowl',
      description: 'Chicken, rice, and broccoli.',
      items: [
        { name: 'Grilled chicken breast', quantity: 4, unit: 'oz', calories: 180, protein: 34, carbs: 0, fat: 4, role: 'PROTEIN' as const },
        { name: 'White rice', quantity: 0.75, unit: 'cup', calories: 160, protein: 3, carbs: 35, fat: 0, role: 'CARB' as const }
      ]
    };
    assert.equal(violatesAvoidList(clean, terms), false);
  });
});
