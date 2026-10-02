import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayKey } from '../../services/api';
import { WeekAgendaList } from '../../components/exercise/weekly/WeekAgendaList';
import { routineRestDatesForWeek } from '../../utils/exerciseRoutineDisplay';
import { useExerciseArea } from './exerciseAreaContext';

export function PlanTab() {
  const { selectedDate, weekDates, weekDays, routine } = useExerciseArea();
  const navigate = useNavigate();

  const routineRestDates = useMemo(() => routineRestDatesForWeek(routine, weekDates), [routine, weekDates]);

  function openDay(date: string) {
    navigate(date === todayKey() ? '/exercise' : `/exercise?date=${date}`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-text-muted">Your week at a glance. Tap any day to open and edit it.</p>
      <WeekAgendaList
        weekDates={weekDates}
        days={weekDays}
        selectedDate={selectedDate}
        routineRestDates={routineRestDates}
        onSelectDay={openDay}
      />
    </div>
  );
}
