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

  it('keeps a swap when the plan apply fails instead of wiping it', () => {
    expect(
      assignmentsAfterPlanApply({
        succeeded: false,
        sent,
        local: swapped,
        previous,
        server: sent
      })
    ).toEqual(swapped);
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
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: true, assignments: 'settled' });
  });

  it('does not write a rejected plan that still has an in-flight swap on screen', () => {
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: swapped,
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: false, assignments: 'settled' });
  });

  it('creates the previous week when a failed apply left no routine for an add', () => {
    expect(
      shouldPersistAfterPlanApply({
        succeeded: false,
        settled: swapped,
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
        previous,
        assignmentsNeedSave: true,
        routineExists: true
      })
    ).toEqual({ persist: true, assignments: 'settled' });
  });
});
