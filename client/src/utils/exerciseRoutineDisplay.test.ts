import { describe, expect, it } from 'vitest';
import type { ExerciseRoutine } from '../types';
import {
  assignedExercisePlan,
  assignedTemplateIdForDate,
  APPLY_EXERCISE_PLAN_HINT,
  exercisePlanPickerOptions,
  exercisePlanPickerValue,
  exerciseWeekPlanHeading,
  NO_EXERCISE_PLAN_ASSIGNED,
  weekdayAssignmentsFromPlanDays
} from './exerciseRoutineDisplay';

function routine(partial: Partial<ExerciseRoutine>): ExerciseRoutine {
  return {
    id: 'routine',
    programId: 'program',
    days: [],
    ...partial
  };
}

describe('exerciseWeekPlanHeading', () => {
  it('returns the saved plan name', () => {
    expect(
      exerciseWeekPlanHeading(
        routine({ exercisePlan: { id: 'plan', name: 'Core #3' }, exercisePlanId: 'plan' })
      )
    ).toBe('Core #3');
  });

  it('returns null when no plan is saved', () => {
    expect(exerciseWeekPlanHeading(routine({}))).toBeNull();
    expect(exerciseWeekPlanHeading(null)).toBeNull();
  });
});

describe('assignedTemplateIdForDate', () => {
  const saved = routine({
    exercisePlan: { id: 'plan', name: 'Core #3' },
    days: [
      { id: 'd0', weekday: 0, templateId: 'chest', template: null, itemOverrides: [] },
      { id: 'd3', weekday: 3, templateId: null, template: null, itemOverrides: [] }
    ]
  });

  it('uses the routine day, not another catalog plan', () => {
    expect(assignedTemplateIdForDate(saved, '2026-10-05')).toBe('chest');
  });

  it('returns null on a rest day and when nothing is assigned', () => {
    expect(assignedTemplateIdForDate(saved, '2026-10-08')).toBeNull();
    expect(assignedTemplateIdForDate(null, '2026-10-08')).toBeNull();
  });
});

describe('exercise plan picker', () => {
  const saved = routine({
    exercisePlanId: 'plan',
    exercisePlan: { id: 'plan', name: 'Core #3' },
    days: [
      {
        id: 'd3',
        weekday: 3,
        templateId: 'legs',
        template: {
          id: 'legs',
          name: 'Legs',
          visibility: 'GLOBAL',
          exerciseCount: 2,
          createdAt: '',
          updatedAt: ''
        },
        itemOverrides: []
      }
    ]
  });

  it('selects the week plan, not the selected day workout', () => {
    expect(assignedExercisePlan(saved)).toEqual({ id: 'plan', name: 'Core #3' });
    expect(exerciseWeekPlanHeading(saved)).toBe('Core #3');
    expect(exercisePlanPickerValue('plan', null)).toBe('plan');
    const options = exercisePlanPickerOptions(
      [{ id: 'other', name: 'Legs' }],
      assignedExercisePlan(saved)
    );
    expect(options.map((plan) => plan.name)).toEqual(['Core #3', 'Legs']);
  });

  it('is Choose a plan when nothing is assigned', () => {
    expect(assignedExercisePlan(null)).toBeNull();
    expect(assignedExercisePlan(routine({}))).toBeNull();
    expect(exerciseWeekPlanHeading(null)).toBeNull();
    expect(exercisePlanPickerValue(null, null)).toBe('');
    const library = exercisePlanPickerOptions([{ id: 'core-3', name: 'Core #3' }], null);
    expect(library.map((plan) => plan.name)).toEqual(['Core #3']);
    expect(exercisePlanPickerValue(null, null)).not.toBe(library[0]?.id);
    expect(NO_EXERCISE_PLAN_ASSIGNED).toBe('No plan is assigned.');
    expect(APPLY_EXERCISE_PLAN_HINT).toBe(
      'Applying replaces the whole week, and weekdays the plan does not cover become rest days.'
    );
  });

  it('maps plan days onto Monday onward', () => {
    expect(
      weekdayAssignmentsFromPlanDays([
        { id: 'tue', dayIndex: 1 },
        { id: 'mon', dayIndex: 0 }
      ])
    ).toEqual([
      { weekday: 0, templateId: 'mon' },
      { weekday: 1, templateId: 'tue' },
      { weekday: 2, templateId: null },
      { weekday: 3, templateId: null },
      { weekday: 4, templateId: null },
      { weekday: 5, templateId: null },
      { weekday: 6, templateId: null }
    ]);
  });
});
