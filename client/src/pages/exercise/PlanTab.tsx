import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayKey } from '../../services/api';
import { WeekAgendaList } from '../../components/exercise/weekly/WeekAgendaList';
import { PlanPrintMenu } from '../../components/export/PlanPrintMenu';
import {
  fetchExercisesForDates,
  formatWeekExportLabel,
  getWeekRange,
  weekHasExercises
} from '../../utils/planExportData';
import { printExercisePlan, printExerciseWeekPlan } from '../../utils/printExercisePlan';
import { routineRestDatesForWeek } from '../../utils/exerciseRoutineDisplay';
import { useExerciseArea } from './exerciseAreaContext';

export function PlanTab() {
  const { selectedDate, weekDates, weekDays, routine } = useExerciseArea();
  const navigate = useNavigate();
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const routineRestDates = useMemo(() => routineRestDatesForWeek(routine, weekDates), [routine, weekDates]);
  const exercises = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.exercises ?? [],
    [weekDays, selectedDate]
  );

  function openDay(date: string) {
    navigate(date === todayKey() ? '/exercise' : `/exercise?date=${date}`);
  }

  function handlePrintDay() {
    setPrintError(null);
    if (!exercises.length) {
      setPrintError('No exercises planned for this day.');
      return;
    }
    try {
      printExercisePlan(exercises, selectedDate);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Could not open print view.');
    }
  }

  async function handlePrintWeek() {
    setPrintError(null);
    setPrinting('week');
    try {
      const week = getWeekRange(selectedDate);
      const days = await fetchExercisesForDates(week.dates);
      if (!weekHasExercises(days)) {
        setPrintError('No exercises planned for this week.');
        return;
      }
      printExerciseWeekPlan(days, formatWeekExportLabel(week.startDate));
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Could not open print view.');
    } finally {
      setPrinting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-app-text-muted">Your week at a glance. Tap any day to open and edit it.</p>
        <PlanPrintMenu printing={printing} onPrintDay={handlePrintDay} onPrintWeek={handlePrintWeek} />
      </div>

      {printError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{printError}</div>
      )}

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
