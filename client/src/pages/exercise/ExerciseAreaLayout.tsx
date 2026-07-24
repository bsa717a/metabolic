import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api, getWeekDates, startOfWeek, todayKey } from '../../services/api';
import type { ExerciseRoutine } from '../../types';
import type { ExercisePlanUndoResponse } from '../../types/exercisePlanUndo';
import { type DayExercises, fetchExercisesForDates } from '../../utils/planExportData';
import { exercisePlanUndoMessage, useExercisePlanUndo } from '../../hooks/useExercisePlanUndo';
import { ExercisePlanUndoToast } from '../../components/exercise/ExercisePlanUndoToast';
import type { ExerciseAreaContext } from './exerciseAreaContext';

function dateFromParams(params: URLSearchParams) {
  const date = params.get('date');
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
}

const TABS = [
  { to: '/exercise', label: 'Today', end: true },
  { to: '/exercise/plan', label: 'Plan', end: false },
  { to: '/exercise/manage', label: 'Manage', end: false }
] as const;

export function ExerciseAreaLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => dateFromParams(searchParams));
  const [weekDays, setWeekDays] = useState<DayExercises[]>([]);
  const [routine, setRoutine] = useState<ExerciseRoutine | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const reloadWeek = useCallback(async () => {
    try {
      const data = await fetchExercisesForDates(weekDates);
      setWeekDays(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load exercises.');
    }
  }, [weekDates]);

  const reloadRoutine = useCallback(async () => {
    try {
      const next = await api<ExerciseRoutine | null>('/api/exercise-routine');
      setRoutine(next);
    } catch {
      setRoutine(null);
    }
  }, []);

  const { undo, registerUndo, performUndo, restoring, clearUndo } = useExercisePlanUndo({
    restoreUrl: '/api/daily-logs/exercises/restore-snapshot',
    onRestored: reloadWeek
  });

  useEffect(() => {
    setSelectedDate(dateFromParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    void reloadWeek();
  }, [reloadWeek]);

  useEffect(() => {
    void reloadRoutine();
  }, [reloadRoutine]);

  const selectDate = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setSearchParams(date === todayKey() ? {} : { date }, { replace: true });
    },
    [setSearchParams]
  );

  const exercisesForSelectedDate = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.exercises ?? [],
    [weekDays, selectedDate]
  );

  const removeExercise = useCallback(
    async (id: string) => {
      setActionError(null);
      setRemovingId(id);
      try {
        const result = await api<ExercisePlanUndoResponse & { ok: boolean }>(`/api/scheduled-exercises/${id}`, {
          method: 'DELETE'
        });
        registerUndo(
          exercisePlanUndoMessage(result.undoSnapshot?.days.length ?? 1, 'Exercise removed'),
          result.undoSnapshot
        );
        await reloadWeek();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'Could not remove exercise.');
      } finally {
        setRemovingId(null);
      }
    },
    [reloadWeek, registerUndo]
  );

  const context: ExerciseAreaContext = {
    selectedDate,
    selectDate,
    weekDates,
    weekDays,
    exercisesForSelectedDate,
    reloadWeek,
    routine,
    reloadRoutine,
    removeExercise,
    removingId,
    registerUndo,
    loadError,
    actionError,
    setActionError
  };

  const currentSearch = searchParams.toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-3xl font-bold text-app-text">Exercise</h1>
          <p className="text-app-text-muted sm:pt-1">Start today&apos;s workout, plan your week, manage routines.</p>
        </div>
        <nav className="inline-flex w-full max-w-md rounded-2xl bg-app-muted p-1 sm:w-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={{ pathname: tab.to, search: currentSearch }}
              end={tab.end}
              className={({ isActive }) =>
                clsx(
                  'flex-1 rounded-xl px-4 py-2 text-center text-sm font-semibold transition sm:flex-none',
                  isActive
                    ? 'bg-app-surface text-app-text shadow-sm'
                    : 'text-app-text-muted hover:text-app-text'
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {loadError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>
      )}

      <Outlet context={context} />

      <ExercisePlanUndoToast
        message={undo?.message ?? null}
        restoring={restoring}
        onUndo={performUndo}
        onDismiss={clearUndo}
      />
    </div>
  );
}
