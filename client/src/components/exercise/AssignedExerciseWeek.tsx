import { useMemo } from 'react';
import type { ExerciseRoutine } from '../../types';
import type { DayExercises } from '../../utils/planExportData';
import { exerciseWeekPlanHeading, routineRestDatesForWeek } from '../../utils/exerciseRoutineDisplay';
import { WeekAgendaList } from './weekly/WeekAgendaList';

/** The week both the client and the coach read: the saved plan, then each day's exercises. */
export function AssignedExerciseWeek({
  routine,
  weekDates,
  days,
  selectedDate,
  onSelectDay,
  intro,
  emptyPlanLabel
}: {
  routine: ExerciseRoutine | null;
  weekDates: string[];
  days: DayExercises[];
  selectedDate: string;
  onSelectDay: (date: string) => void;
  intro?: string;
  emptyPlanLabel?: string;
}) {
  const planName = exerciseWeekPlanHeading(routine);
  const routineRestDates = useMemo(
    () => routineRestDatesForWeek(routine, weekDates),
    [routine, weekDates]
  );

  return (
    <div className="space-y-4">
      {intro ? <p className="text-sm text-app-text-muted">{intro}</p> : null}
      {planName ? (
        <p className="text-sm text-app-text-muted">
          Plan <span className="font-medium text-app-text">{planName}</span>
        </p>
      ) : emptyPlanLabel ? (
        <p className="text-sm text-app-text-muted">
          <span className="font-medium text-app-text">{emptyPlanLabel}</span>
        </p>
      ) : null}
      <WeekAgendaList
        weekDates={weekDates}
        days={days}
        selectedDate={selectedDate}
        routineRestDates={routineRestDates}
        onSelectDay={onSelectDay}
      />
    </div>
  );
}
