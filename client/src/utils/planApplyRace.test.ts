import { describe, expect, it } from 'vitest';
import {
  assignmentsAfterPlanApply,
  shouldPersistAfterPlanApply,
  weekAssignmentsNeedSave,
  type WeekAssignment
} from './planApplyRace';

const previous: WeekAssignment[] = [
  { weekday: 0, templateId: 'push' },
  { weekday: 1, templateId: 'legs' }
];

const sent: WeekAssignment[] = [
  { weekday: 0, templateId: 'pull' },
  { weekday: 1, templateId: 'legs' }
];

const swapped: WeekAssignment[] = [
  { weekday: 0, templateId: 'legs' },
  { weekday: 1, templateId: 'pull' }
];

describe('assignmentsAfterPlanApply', () => {
  it('restores the previous week when the plan apply fails', () => {
    expect(
      assignmentsAfterPlanApply({
        succeeded: false,
        sent,
        local: sent,
        previous,
        server: sent
      })
    ).toEqual(previous);
  });

  it('keeps a swap made while a successful plan save was in flight', () => {
    expect(
      assignmentsAfterPlanApply({
        succeeded: true,
        sent,
        local: swapped,
        previous,
        server: sent
      })
    ).toEqual(swapped);
  });

  it('restores the previous plan when a swap was in flight during a failed apply', () => {
    expect(
      assignmentsAfterPlanApply({
        succeeded: false,
        sent,
        local: swapped,
        previous,
        server: sent
      })
    ).toEqual(previous);
  });

  it('adopts the server week when nothing changed during a successful save', () => {
    const server: WeekAssignment[] = [
      { weekday: 0, templateId: 'pull' },
      { weekday: 1, templateId: 'legs' }
    ];
    expect(
      assignmentsAfterPlanApply({
        succeeded: true,
        sent,
        local: sent,
        previous,
        server
      })
    ).toEqual(server);
  });
});

describe('weekAssignmentsNeedSave', () => {
  it('does not persist a rolled-back week that already matches the saved routine', () => {
    expect(weekAssignmentsNeedSave(previous, previous)).toBe(false);
  });

  it('persists when no routine exists yet so a weekday add has a row to land on', () => {
    expect(weekAssignmentsNeedSave(previous, [])).toBe(true);
  });
});

describe('shouldPersistAfterPlanApply', () => {
  it('does not replay a rejected plan after the week rolls back onto the saved routine', () => {
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: previous,
        atSettlement: previous,
        previous,
        assignmentsNeedSave: false,
        routineExists: true
      })
    ).toEqual({ persist: false, assignments: 'settled' });
  });

  it('still saves the previous week when that week itself has unsaved edits', () => {
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: previous,
        atSettlement: previous,
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: true, assignments: 'settled' });
  });

  it('does not save an in-flight swap as the rejected plan', () => {
    const display = assignmentsAfterPlanApply({
      succeeded: false,
      sent,
      local: swapped,
      previous,
      server: sent
    });
    expect(display).toEqual(previous);
    expect(weekAssignmentsNeedSave(display, previous)).toBe(false);
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: swapped,
        atSettlement: swapped,
        rejected: swapped,
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: false, assignments: 'settled' });
  });

  it('saves a weekday reassignment made after a failed apply rolls back', () => {
    const later: WeekAssignment[] = [
      { weekday: 0, templateId: 'core' },
      { weekday: 1, templateId: 'legs' }
    ];
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: later,
        atSettlement: previous,
        rejected: swapped,
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: true, assignments: 'settled' });
  });

  it('creates the previous week when a failed apply left no routine for an add', () => {
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: swapped,
        atSettlement: swapped,
        previous,
        assignmentsNeedSave: true,
        routineExists: false
      })
    ).toEqual({ persist: true, assignments: 'previous' });
  });

  it('persists weekday edits that landed during a successful plan save', () => {
    expect(
      shouldPersistAfterPlanApply({
        succeeded: true,
        settled: swapped,
        atSettlement: sent,
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: true, assignments: 'settled' });
  });
});
