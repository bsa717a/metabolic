import { describe, it, expect } from 'vitest';
import type { Meal } from '../types';
import { parseFoodEntry } from './foodEntryParse';

const meals = [
  { id: 'm1', mealNumber: 1, name: 'Breakfast', plannedTime: '07:30', status: 'PLANNED' },
  { id: 'm2', mealNumber: 2, name: 'Snack', plannedTime: '10:30', status: 'PLANNED' },
  { id: 'm3', mealNumber: 3, name: 'Lunch', plannedTime: '12:30', status: 'PLANNED' },
  { id: 'm4', mealNumber: 4, name: 'Snack', plannedTime: '15:30', status: 'PLANNED' },
  { id: 'm5', mealNumber: 5, name: 'Dinner', plannedTime: '18:00', status: 'PLANNED' }
] as unknown as Meal[];

const parse = (input: string) => parseFoodEntry(meals, input, null);

describe('parseFoodEntry — meal directives', () => {
  it('handles a natural-language meal + time preamble line and strips it', () => {
    const { targetMeal, foodText } = parse(
      'I had a meal 5 at 6pm\n6ounces of chicken\n1/4 cup of rice\n1/4 peach\n1 scoop flavcity chocolate protein'
    );
    expect(targetMeal?.name).toBe('Dinner');
    expect(foodText).toBe('6ounces of chicken\n1/4 cup of rice\n1/4 peach\n1 scoop flavcity chocolate protein');
  });

  it('matches "meal N" / "to meal N" / "meal number N"', () => {
    expect(parse('to meal 2\nchicken').targetMeal?.name).toBe('Snack');
    expect(parse('meal number 3\ngrilled cheese').targetMeal?.name).toBe('Lunch');
    expect(parse('meal number 3\ngrilled cheese').foodText).toBe('grilled cheese');
  });

  it('matches leading "1. Breakfast", ordinal snack, and bare meal name', () => {
    expect(parse('1. Breakfast\n2 eggs')).toMatchObject({ foodText: '2 eggs' });
    expect(parse('1. Breakfast\n2 eggs').targetMeal?.name).toBe('Breakfast');
    expect(parse('first snack\nalmonds').targetMeal?.name).toBe('Snack');
    expect(parse('Lunch\nsalad').targetMeal?.name).toBe('Lunch');
  });

  it('matches connector ("for breakfast") and label prefix ("Dinner:")', () => {
    expect(parse('I had eggs for breakfast')).toMatchObject({ foodText: 'eggs' });
    expect(parse('I had eggs for breakfast').targetMeal?.name).toBe('Breakfast');
    expect(parse('Dinner:\nsteak and potatoes').foodText).toBe('steak and potatoes');
  });

  it('matches a clock time to the nearest meal', () => {
    expect(parse('at 6pm\nchicken').targetMeal?.name).toBe('Dinner');
    expect(parse('dinner at 7pm\nsteak')).toMatchObject({ foodText: 'steak' });
    expect(parse('dinner at 7pm\nsteak').targetMeal?.name).toBe('Dinner');
  });

  it('does NOT treat real foods as directives', () => {
    expect(parse('1/4 cup of rice').foodText).toBe('1/4 cup of rice');
    expect(parse('6 oz chicken and rice').foodText).toBe('6 oz chicken and rice');
    expect(parse('breakfast burrito').foodText).toBe('breakfast burrito');
  });
});
