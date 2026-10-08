import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isInExerciseApplyWindow, materializeAction } from './exerciseMaterialize.js';

const empty = {
  initialized: false,
  manuallyEdited: false,
  scheduledCount: 0,
  hasRoutine: false,
  hasResolvedTemplate: false,
  inApplyWindow: true
};

describe('materializeAction', () => {
  it('applies the saved routine when an existing day has no exercises yet', () => {
    assert.equal(materializeAction({ ...empty, hasRoutine: true }), 'routine');
  });

  it('applies the resolved template only when there is no routine', () => {
    assert.equal(materializeAction({ ...empty, hasResolvedTemplate: true }), 'template');
    assert.equal(
      materializeAction({ ...empty, hasRoutine: true, hasResolvedTemplate: true }),
      'routine'
    );
  });

  it('does not invent a plan for an empty day with nothing assigned', () => {
    assert.equal(materializeAction(empty), 'skip');
  });

  it('leaves days that already have exercises, were edited, or were initialized', () => {
    assert.equal(materializeAction({ ...empty, hasRoutine: true, scheduledCount: 2 }), 'skip');
    assert.equal(materializeAction({ ...empty, hasRoutine: true, manuallyEdited: true }), 'skip');
    assert.equal(materializeAction({ ...empty, hasRoutine: true, initialized: true }), 'skip');
  });

  it('does not rewrite weeks before the current one', () => {
    assert.equal(materializeAction({ ...empty, hasRoutine: true, inApplyWindow: false }), 'skip');
    const thursday = new Date(Date.UTC(2026, 9, 8));
    assert.equal(isInExerciseApplyWindow(new Date(Date.UTC(2026, 9, 5)), thursday), true);
    assert.equal(isInExerciseApplyWindow(new Date(Date.UTC(2026, 9, 4)), thursday), false);
    assert.equal(isInExerciseApplyWindow(new Date(Date.UTC(2026, 9, 12)), thursday), true);
  });
});
