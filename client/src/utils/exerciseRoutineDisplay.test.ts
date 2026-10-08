import { describe, expect, it } from 'vitest';
import type { ExerciseRoutine } from '../types';
import { assignedTemplateIdForDate, exerciseWeekPlanHeading } from './exerciseRoutineDisplay';

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
