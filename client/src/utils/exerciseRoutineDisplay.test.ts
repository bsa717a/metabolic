import { describe, expect, it } from 'vitest';
import type { ExerciseRoutine } from '../types';
import {
  assignedExercisePlan,
  assignedTemplateIdForDate,
  coachWeekDaysForRoutine,
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
        routine({ exercisePlan: { id: 'split-5', name: '5 Day Split (#5)' }, exercisePlanId: 'split-5' })
      )
    ).toBe('5 Day Split (#5)');
  });

  it('returns null when no plan is saved', () => {
    expect(exerciseWeekPlanHeading(routine({}))).toBeNull();
    expect(exerciseWeekPlanHeading(null)).toBeNull();
  });
});

describe('assignedTemplateIdForDate', () => {
  const saved = routine({
    exercisePlan: { id: 'split-5', name: '5 Day Split (#5)' },
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
    exercisePlanId: 'split-5',
    exercisePlan: { id: 'split-5', name: '5 Day Split (#5)' },
    days: [
      {
        id: 'fri',
        weekday: 4,
        templateId: 'core-3',
        template: {
          id: 'core-3',
          name: 'Core #3',
          visibility: 'GLOBAL',
          exerciseCount: 2,
          createdAt: '',
          updatedAt: ''
        },
        itemOverrides: []
      }
    ]
  });

  it('selects the week plan, not Friday Core #3', () => {
    expect(assignedExercisePlan(saved)).toEqual({ id: 'split-5', name: '5 Day Split (#5)' });
    expect(exerciseWeekPlanHeading(saved)).toBe('5 Day Split (#5)');
    expect(exercisePlanPickerValue('split-5', null)).toBe('split-5');
    expect(exercisePlanPickerValue('split-5', null)).not.toBe('core-3');
    const options = exercisePlanPickerOptions(
      [{ id: 'split-5', name: '5 Day Split (#5)' }],
      assignedExercisePlan(saved)
    );
    expect(options.map((plan) => plan.name)).toEqual(['5 Day Split (#5)']);
    expect(options.map((plan) => plan.name)).not.toContain('Core #3');
  });

  it('is Choose a plan when nothing is assigned', () => {
    expect(assignedExercisePlan(null)).toBeNull();
    expect(assignedExercisePlan(routine({}))).toBeNull();
    expect(exerciseWeekPlanHeading(null)).toBeNull();
    expect(exercisePlanPickerValue(null, null)).toBe('');
    const library = exercisePlanPickerOptions([{ id: 'split-5', name: '5 Day Split (#5)' }], null);
    expect(library.map((plan) => plan.name)).toEqual(['5 Day Split (#5)']);
    expect(library.map((plan) => plan.name)).not.toContain('Core #3');
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

describe('coachWeekDaysForRoutine', () => {
  const saved = routine({
    exercisePlanId: 'split-5',
    exercisePlan: { id: 'split-5', name: '5 Day Split (#5)' },
    days: [
      {
        id: 'mon',
        weekday: 0,
        templateId: 'push',
        template: {
          id: 'push',
          name: 'Push',
          visibility: 'GLOBAL',
          exerciseCount: 4,
          createdAt: '',
          updatedAt: ''
        },
        itemOverrides: []
      },
      { id: 'sun', weekday: 6, templateId: null, template: null, itemOverrides: [] }
    ]
  });

  it('keeps an assigned workout visible when the exercise list is still empty', () => {
    const days = coachWeekDaysForRoutine(saved, ['2026-10-05', '2026-10-11'], [
      { date: '2026-10-05', exercises: [] },
      { date: '2026-10-11', exercises: [] }
    ]);
    expect(days[0]?.exercises[0]?.exercise.name).toBe('Push');
    expect(days[1]?.exercises).toEqual([]);
  });

  it('uses exercises already returned for the day', () => {
    const days = coachWeekDaysForRoutine(saved, ['2026-10-05'], [
      { date: '2026-10-05', exercises: [{ id: 'real', status: 'PLANNED', exercise: { name: 'Bench press' } }] }
    ]);
    expect(days[0]?.exercises.map((item) => item.exercise.name)).toEqual(['Bench press']);
  });
});
