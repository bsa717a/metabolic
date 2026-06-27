import { describe, expect, it } from 'vitest';
import { analyzeExerciseWeek, previousWeekDates } from './exerciseWeekAnalysis';

describe('analyzeExerciseWeek', () => {
  it('summarizes completion and generates coach insights', () => {
    const weekDates = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];
    const days = [
      {
        date: '2026-06-22',
        exercises: [
          { id: '1', status: 'DONE', exercise: { name: 'Squat' } },
          { id: '2', status: 'DONE', exercise: { name: 'Row' } }
        ]
      },
      {
        date: '2026-06-23',
        exercises: [{ id: '3', status: 'PLANNED', exercise: { name: 'Bench' } }]
      },
      { date: '2026-06-24', exercises: [] },
      {
        date: '2026-06-25',
        exercises: [{ id: '4', status: 'SKIPPED', exercise: { name: 'Run', bodyPart: 'Cardio' } }]
      }
    ];

    const analysis = analyzeExerciseWeek(days, weekDates);

    expect(analysis.scheduled).toBe(4);
    expect(analysis.done).toBe(2);
    expect(analysis.skipped).toBe(1);
    expect(analysis.restDays).toBeGreaterThan(0);
    expect(analysis.topSkipped).toEqual([{ name: 'Run', count: 1 }]);
    expect(analysis.bodyPartMix.some((part) => part.bodyPart === 'Cardio')).toBe(true);
    expect(analysis.insights.length).toBeGreaterThan(0);
    expect(analysis.insights.some((line) => line.includes('Completed'))).toBe(true);
  });

  it('handles an empty week', () => {
    const weekDates = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];
    const analysis = analyzeExerciseWeek([], weekDates);

    expect(analysis.scheduled).toBe(0);
    expect(analysis.insights[0]).toContain('No workouts were scheduled');
  });

  it('compares against the previous week', () => {
    const weekDates = ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'];
    const prevDates = previousWeekDates('2026-06-22');

    const currentDays = [
      {
        date: '2026-06-22',
        exercises: [
          { id: '1', status: 'DONE', exercise: { name: 'Squat' } },
          { id: '2', status: 'DONE', exercise: { name: 'Row' } }
        ]
      }
    ];
    const previousDays = [
      {
        date: '2026-06-15',
        exercises: [{ id: '3', status: 'PLANNED', exercise: { name: 'Bench' } }]
      }
    ];

    const analysis = analyzeExerciseWeek(currentDays, weekDates, {
      previousDays,
      previousWeekDates: prevDates
    });

    expect(analysis.comparison).not.toBeNull();
    expect(analysis.comparison?.trend).toBe('up');
    expect(analysis.insights.some((line) => line.includes('last week'))).toBe(true);
  });
});
