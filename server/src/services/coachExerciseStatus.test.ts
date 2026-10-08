import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coachExerciseStatusName } from './coachExerciseStatus.js';

describe('coachExerciseStatusName', () => {
  it('hides a day workout when no routine is saved', () => {
    assert.equal(coachExerciseStatusName(false, 'Core #3'), null);
    assert.equal(coachExerciseStatusName(false, 'Chest and Triceps'), null);
    assert.equal(coachExerciseStatusName(false, null), null);
  });

  it('keeps the resolved day name once a routine is saved', () => {
    assert.equal(coachExerciseStatusName(true, 'Core #3'), 'Core #3');
    assert.equal(coachExerciseStatusName(true, '  '), null);
  });
});
