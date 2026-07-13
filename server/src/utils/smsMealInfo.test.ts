import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMealInfoQuery, parseInfoDomain } from './smsFoodParse.js';

describe('parseMealInfoQuery — routes meal/macro lookups', () => {
  it('matches macro/nutrient questions about a specific meal', () => {
    assert.deepEqual(parseMealInfoQuery('how many carbs are in my dinner?'), { meal: 'dinner', date: undefined });
    assert.deepEqual(parseMealInfoQuery('what are the calories and macros for lunch?'), {
      meal: 'lunch',
      date: undefined
    });
    assert.deepEqual(parseMealInfoQuery('how much fat is in my breakfast?'), { meal: 'breakfast', date: undefined });
    assert.equal(parseMealInfoQuery("what's the protein in dinner tomorrow?")?.meal, 'dinner');
    assert.equal(parseMealInfoQuery("what's the protein in dinner tomorrow?")?.date, 'tomorrow');
  });

  it('matches whole-day plan questions', () => {
    assert.ok(parseMealInfoQuery('whats my whole plan for the day with macros'));
    assert.equal(parseMealInfoQuery('what are my macros for tomorrow?')?.date, 'tomorrow');
  });

  it('captures relative dates', () => {
    assert.equal(parseMealInfoQuery('how many calories did I have in lunch yesterday?')?.date, 'yesterday');
    assert.equal(parseMealInfoQuery('macros for dinner tonight')?.date, 'today');
  });

  it('does NOT steal meal-suggestion requests', () => {
    assert.equal(parseMealInfoQuery('what should I eat for lunch?'), null);
    assert.equal(parseMealInfoQuery('any ideas for dinner?'), null);
  });

  it('does NOT steal remaining-status questions', () => {
    assert.equal(parseMealInfoQuery('how many calories do I have left today?'), null);
    assert.equal(parseMealInfoQuery('how much protein is remaining?'), null);
  });

  it('does NOT steal logging statements', () => {
    assert.equal(parseMealInfoQuery('I ate 6 oz chicken for dinner'), null);
    assert.equal(parseMealInfoQuery('log 2 eggs for breakfast'), null);
    assert.equal(parseMealInfoQuery('add a banana to lunch'), null);
    assert.equal(parseMealInfoQuery('mark lunch done'), null);
  });
});

describe('parseInfoDomain — routes non-nutrition info questions', () => {
  it('detects each domain', () => {
    assert.equal(parseInfoDomain("what's my workout today?")?.domain, 'exercise');
    assert.equal(parseInfoDomain('how many sets of squats do I have?')?.domain, 'exercise');
    assert.equal(parseInfoDomain('how much water have I had today?')?.domain, 'hydration');
    assert.equal(parseInfoDomain("what's my current weight?")?.domain, 'progress');
    assert.equal(parseInfoDomain('how much have I lost?')?.domain, 'progress');
    assert.equal(parseInfoDomain('what are my calorie targets?')?.domain, 'plan');
    assert.equal(parseInfoDomain('what week am I on?')?.domain, 'plan');
  });

  it('captures relative dates', () => {
    assert.equal(parseInfoDomain("what's my workout tomorrow?")?.date, 'tomorrow');
  });

  it('does NOT steal actions or unrelated messages', () => {
    assert.equal(parseInfoDomain('mark my workout done'), null);
    assert.equal(parseInfoDomain('log 16 oz water'), null);
    assert.equal(parseInfoDomain('I did my workout'), null);
    assert.equal(parseInfoDomain('hey how are you'), null);
  });
});
