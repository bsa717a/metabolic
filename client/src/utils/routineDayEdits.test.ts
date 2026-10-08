import { describe, expect, it } from 'vitest';
import type { ExerciseRoutineDayExtra, ExerciseTemplateItem } from '../types';
import { routineWeekdayIsRest, visibleRoutineDayExercises } from './routineDayEdits';

function templateItem(id: string, name: string, sets = 3, reps = '10'): ExerciseTemplateItem {
  return {
    id,
    exerciseId: id,
    sortOrder: 0,
    sets,
    reps,
    speed: '1/2',
    durationSeconds: null,
    distance: null,
    weight: null,
    exercise: { name }
  };
}

function extra(id: string, name: string): ExerciseRoutineDayExtra {
  return {
    id,
    exerciseId: id,
    sortOrder: 0,
    sets: 4,
    reps: '8',
    speed: null,
    durationSeconds: null,
    distance: null,
    weight: null,
    exercise: { id, name }
  };
}

describe('visibleRoutineDayExercises', () => {
  it('drops a removed plan exercise and keeps an added one with its usual prescription', () => {
    const visible = visibleRoutineDayExercises({
      templateItems: [templateItem('push', 'Push-up'), templateItem('squat', 'Goblet squat', 5, '12')],
      excludedTemplateItemIds: ['squat'],
      itemOverrides: [{ templateItemId: 'push', sets: 2, reps: '15/12/10' }],
      extras: [extra('plank', 'Plank')]
    });

    expect(visible.map((item) => item.name)).toEqual(['Push-up', 'Plank']);
    expect(visible[0]).toMatchObject({ source: 'template', sets: 2, reps: '15/12/10' });
    expect(visible[1]).toMatchObject({ source: 'extra', sets: 4, reps: '8', extraId: 'plank' });
  });
});

describe('routineWeekdayIsRest', () => {
  it('is rest only when the weekday has no plan workout and no added exercises', () => {
    expect(routineWeekdayIsRest({ templateId: null, extras: [] })).toBe(true);
    expect(routineWeekdayIsRest({ templateId: 'push', extras: [] })).toBe(false);
    expect(routineWeekdayIsRest({ templateId: null, extras: [extra('walk', 'Walk')] })).toBe(false);
  });
});
