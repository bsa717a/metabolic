import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coachExercisePlanScope } from './exercisePlanService.js';

describe('coach exercise plan scope', () => {
  it('does not return every plan for a super admin viewing one client', () => {
    assert.equal(coachExercisePlanScope('amy', true), 'client');
    assert.equal(coachExercisePlanScope('amy', false), 'client');
    assert.equal(coachExercisePlanScope(undefined, true), 'all');
    assert.equal(coachExercisePlanScope(undefined, false), 'own-and-library');
  });
});
