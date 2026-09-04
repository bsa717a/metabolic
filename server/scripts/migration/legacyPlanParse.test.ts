import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  circuitItems,
  mealItems,
  parseCircuits,
  parseIntLoose,
  parseMeals,
  parsePlannedTime,
  parseQuantity,
  parseWaterOz,
  parseWeight,
  toNumber
} from './legacyPlanParse.ts';

test('parseMeals reads the singular "meal" root and tolerates junk', () => {
  const raw = '{"meal":[{"mealnum":1,"name":"Breakfast","time":"7:00am","items":[{"name":"Eggs","mulipiler":"2","portion_name":"egg","calories":140,"proteins":12,"carbs":1,"fats":10}]}]}';
  const meals = parseMeals(raw);
  assert.equal(meals.length, 1);
  assert.equal(meals[0].name, 'Breakfast');
  assert.equal(mealItems(meals[0]).length, 1);
  assert.equal(parseMeals('not json').length, 0);
  assert.equal(parseMeals(null).length, 0);
  assert.equal(parseMeals('{"foo":[]}').length, 0);
});

test('mealItems drops blank/nameless items', () => {
  const meals = parseMeals('{"meal":[{"mealnum":1,"items":[{"name":""},{"name":"  "},{"name":"Rice","calories":100}]}]}');
  const items = mealItems(meals[0]);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Rice');
});

test('parseCircuits reads the singular "circuit" root', () => {
  const raw = '{"circuit":[{"circuitnum":1,"name":"Cardio","items":[{"name":"Treadmill","sets":"3","reps":"10-12","weight":"0"}]}]}';
  const circuits = parseCircuits(raw);
  assert.equal(circuits.length, 1);
  assert.equal(circuitItems(circuits[0]).length, 1);
  assert.equal(parseCircuits('{"circuit":[{"name":"Empty","items":[]}]}')[0].items?.length, 0);
});

test('parsePlannedTime converts 12h/24h and rejects garbage', () => {
  assert.equal(parsePlannedTime('7:00am'), '07:00');
  assert.equal(parsePlannedTime('12:00am'), '00:00');
  assert.equal(parsePlannedTime('12:30pm'), '12:30');
  assert.equal(parsePlannedTime('7pm'), '19:00');
  assert.equal(parsePlannedTime('1:00pm'), '13:00');
  assert.equal(parsePlannedTime('13:30'), '13:30');
  assert.equal(parsePlannedTime(''), null);
  assert.equal(parsePlannedTime(null), null);
  assert.equal(parsePlannedTime('lunchtime'), null);
  assert.equal(parsePlannedTime('25:00'), null);
});

test('parseQuantity defaults to 1 and handles decimals', () => {
  assert.equal(parseQuantity('3'), 3);
  assert.equal(parseQuantity('.50'), 0.5);
  assert.equal(parseQuantity('0'), 1);
  assert.equal(parseQuantity(''), 1);
  assert.equal(parseQuantity(null), 1);
});

test('parseIntLoose takes the first integer of a range', () => {
  assert.equal(parseIntLoose('10-12'), 10);
  assert.equal(parseIntLoose('8 to 10'), 8);
  assert.equal(parseIntLoose('3'), 3);
  assert.equal(parseIntLoose('AMRAP'), null);
  assert.equal(parseIntLoose(null), null);
});

test('parseWeight extracts a positive number or null', () => {
  assert.equal(parseWeight('135 lbs'), 135);
  assert.equal(parseWeight('22.5'), 22.5);
  assert.equal(parseWeight('bodyweight'), null);
  assert.equal(parseWeight('0'), null);
});

test('parseWaterOz extracts ounces', () => {
  assert.equal(parseWaterOz('100 oz'), 100);
  assert.equal(parseWaterOz('64'), 64);
  assert.equal(parseWaterOz(''), null);
  assert.equal(parseWaterOz('none'), null);
});

test('toNumber coerces safely', () => {
  assert.equal(toNumber('108'), 108);
  assert.equal(toNumber(3.9), 3.9);
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber('abc'), 0);
});
