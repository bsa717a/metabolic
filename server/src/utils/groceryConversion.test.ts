import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consolidateShoppingListItems,
  formatGroceryDescription,
  isWholeEggFood
} from './groceryConversion.js';
import { mergeEnrichment } from '../services/shoppingListService.js';

describe('isWholeEggFood', () => {
  it('matches whole eggs only', () => {
    assert.equal(isWholeEggFood('eggs'), true);
    assert.equal(isWholeEggFood('Large Eggs'), true);
    assert.equal(isWholeEggFood('egg whites'), false);
    assert.equal(isWholeEggFood('eggplant'), false);
  });
});

describe('consolidateShoppingListItems', () => {
  it('merges egg count and dozens into one dozen-friendly line', () => {
    const consolidated = consolidateShoppingListItems([
      { id: '0', name: 'eggs', quantity: 6, unit: 'each', occurrenceCount: 3 },
      { id: '1', name: 'eggs', quantity: 2, unit: 'dozen', occurrenceCount: 2 }
    ]);

    assert.equal(consolidated.length, 1);
    assert.equal(consolidated[0].name, 'eggs');
    assert.equal(consolidated[0].quantity, 30);
    assert.equal(consolidated[0].unit, 'egg');
    assert.equal(consolidated[0].occurrenceCount, 5);
    assert.equal(formatGroceryDescription(consolidated[0].name, consolidated[0].quantity, consolidated[0].unit), '3 dozen eggs');
  });

  it('merges same clean name with convertible weight units', () => {
    const consolidated = consolidateShoppingListItems([
      { id: '0', name: 'Grilled chicken breast', quantity: 8, unit: 'oz', occurrenceCount: 1 },
      { id: '1', name: 'Grilled chicken breast', quantity: 0.5, unit: 'lb', occurrenceCount: 1 }
    ]);

    assert.equal(consolidated.length, 1);
    assert.equal(consolidated[0].quantity, 1);
    assert.equal(consolidated[0].unit, 'lb');
    assert.equal(
      formatGroceryDescription(consolidated[0].name, consolidated[0].quantity, consolidated[0].unit),
      '1 lb Grilled chicken breast'
    );
  });

  it('does not merge different foods', () => {
    const consolidated = consolidateShoppingListItems([
      { id: '0', name: 'eggs', quantity: 6, unit: 'each', occurrenceCount: 1 },
      { id: '1', name: 'egg whites', quantity: 4, unit: 'each', occurrenceCount: 1 },
      { id: '2', name: 'unsweetened almond milk', quantity: 2, unit: 'cup', occurrenceCount: 1 },
      { id: '3', name: '2% milk', quantity: 1, unit: 'cup', occurrenceCount: 1 }
    ]);

    assert.equal(consolidated.length, 4);
  });
});

describe('formatGroceryDescription US packages', () => {
  it('uses jar/box/container/can for common pantry items', () => {
    assert.equal(formatGroceryDescription('Peanut butter', 7, 'tbsp'), '1 jar Peanut butter');
    assert.equal(formatGroceryDescription('Simple Mills Sea Salt Crackers', 91, 'each'), '3 boxes Simple Mills Sea Salt Crackers');
    assert.match(formatGroceryDescription('Flavcity chocolate protein powder', 7, 'scoop'), /container/i);
    assert.equal(formatGroceryDescription('Canned black olives', 1.75, 'cup'), '1 can Canned black olives');
  });

  it('converts butter tablespoons to sticks', () => {
    assert.equal(formatGroceryDescription('Butter', 17.5, 'tbsp'), '3 sticks Butter');
    assert.equal(formatGroceryDescription('Butter', 8, 'tbsp'), '1 stick Butter');
  });

  it('uses liquid and egg store units', () => {
    assert.equal(formatGroceryDescription('unsweetened almond milk', 3.5, 'cup'), '1 quart unsweetened almond milk');
    assert.equal(formatGroceryDescription('eggs', 6, 'each'), '6 eggs');
    assert.equal(formatGroceryDescription('eggs', 2, 'dozen'), '2 dozen eggs');
  });
});

describe('mergeEnrichment', () => {
  it('ignores bare AI names and keeps deterministic buy amounts', () => {
    const items = [
      { id: '0', name: 'White rice', quantity: 3.5, unit: 'cup', occurrenceCount: 7 },
      { id: '1', name: 'eggs', quantity: 30, unit: 'egg', occurrenceCount: 5 }
    ];

    const merged = mergeEnrichment(items, {
      intro: 'Here is your grocery list.',
      items: [
        {
          id: '0',
          groceryDescription: 'White rice',
          groceryCategory: 'Pantry',
          storeLocation: 'Aisle 4',
          notes: null
        },
        {
          id: '1',
          groceryDescription: 'eggs',
          groceryCategory: 'Dairy & Eggs',
          storeLocation: 'Dairy / Aisle 16',
          notes: null
        }
      ]
    });

    assert.equal(merged[0].groceryDescription, '2 lb bag White rice');
    assert.equal(merged[0].storeLocation, 'Aisle 4');
    assert.equal(merged[1].groceryDescription, '3 dozen eggs');
    assert.equal(merged[1].groceryCategory, 'Dairy & Eggs');
  });
});
