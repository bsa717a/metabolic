import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFoodGroup } from './foodGroupService.js';

describe('resolveFoodGroup', () => {
  it('uses an authored role when present', () => {
    assert.equal(resolveFoodGroup({ name: 'Salmon', role: 'PROTEIN', protein: 39, carbs: 0, fat: 22 }), 'Protein');
    assert.equal(resolveFoodGroup({ name: 'Almonds', role: 'FAT', protein: 3, carbs: 3, fat: 7 }), 'Fats');
  });

  it('keeps fatty fish and eggs in Protein even when fat calories win', () => {
    assert.equal(resolveFoodGroup({ name: 'Salmon', role: null, protein: 39, carbs: 0, fat: 22 }), 'Protein');
    assert.equal(
      resolveFoodGroup({ name: 'Fish - Atlantic Salmon (Broiled)', role: null, protein: 6.5, carbs: 0, fat: 3.5 }),
      'Protein'
    );
    assert.equal(
      resolveFoodGroup({ name: 'Egg - Whole Egg Hardboiled', role: null, protein: 6, carbs: 0.6, fat: 5 }),
      'Protein'
    );
    assert.equal(resolveFoodGroup({ name: '2 large eggs', role: null, protein: 12, carbs: 1, fat: 10 }), 'Protein');
  });

  it('classifies catalog fruit and vegetable prefixes', () => {
    assert.equal(resolveFoodGroup({ name: 'Fruit - Banana', role: null, protein: 1.3, carbs: 27, fat: 0.4 }), 'Fruits');
    assert.equal(resolveFoodGroup({ name: 'Berries - Blueberries', role: null, protein: 1.1, carbs: 21.4, fat: 0.5 }), 'Fruits');
    assert.equal(
      resolveFoodGroup({ name: 'Vegetable - Steamed Broccoli', role: null, protein: 2, carbs: 6, fat: 0 }),
      'Veggies'
    );
    assert.equal(
      resolveFoodGroup({ name: 'Squash - Butternut Squash (baked)', role: null, protein: 1, carbs: 16, fat: 0 }),
      'Veggies'
    );
  });

  it('does not treat coconut yogurt or yogurt sauce as Protein', () => {
    assert.equal(resolveFoodGroup({ name: 'COYO-Coconut Yogurt', role: null, protein: 3, carbs: 10, fat: 38 }), 'Fats');
    assert.equal(resolveFoodGroup({ name: 'Greek yogurt sauce', role: 'FAT', protein: 2, carbs: 1.5, fat: 0.5 }), 'Fats');
  });

  it('falls back to dominant-macro calories', () => {
    assert.equal(resolveFoodGroup({ name: 'Butter', role: null, protein: 0.1, carbs: 0, fat: 12 }), 'Fats');
    assert.equal(resolveFoodGroup({ name: 'Brown rice, cooked', role: null, protein: 2.5, carbs: 23, fat: 1 }), 'Carbs');
    assert.equal(resolveFoodGroup({ name: 'Chicken breast', role: null, protein: 52, carbs: 0, fat: 6 }), 'Protein');
  });
});
