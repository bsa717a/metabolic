import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exercisePlanNameFromRoutine } from './coachPlanHeader.js';

describe('exercisePlanNameFromRoutine', () => {
  it('returns the saved exercise plan name', () => {
    assert.equal(
      exercisePlanNameFromRoutine({ exercisePlan: { name: '5 Day Split (#5)' } }),
      '5 Day Split (#5)'
    );
  });

  it('returns null when the routine has no exercise plan', () => {
    assert.equal(exercisePlanNameFromRoutine(null), null);
    assert.equal(exercisePlanNameFromRoutine({ exercisePlan: null }), null);
    assert.equal(exercisePlanNameFromRoutine({ exercisePlan: { name: '   ' } }), null);
  });
});
