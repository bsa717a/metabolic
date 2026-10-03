import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { api, getWeekDates, startOfWeek, todayDateParam, todayKey } from '../../services/api';
import { PlanPrintButton } from '../../components/export/PlanPrintButton';
import type { PlanPrintOrientation } from '../../utils/planPrintOrientation';
import { printExercisePlan, printExerciseWeekPlan } from '../../utils/printExercisePlan';
import type { ExerciseRoutine } from '../../types';
import type {
  ExerciseAutoChoice,
  ExerciseAutoLevel,
  ExerciseAutoLocation,
  ExerciseAutoMode,
  ExerciseAutoState
} from '../../types/exerciseAuto';
import type { ExercisePlanUndoResponse } from '../../types/exercisePlanUndo';
import { type DayExercises, fetchExercisesForDates, formatWeekExportLabel, weekHasExercises } from '../../utils/planExportData';
import { exercisePlanUndoMessage, useExercisePlanUndo } from '../../hooks/useExercisePlanUndo';
import { ExercisePlanUndoToast } from '../../components/exercise/ExercisePlanUndoToast';
import { ExerciseModeSwitch } from '../../components/exercise/automatic/AutomaticExercise';
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
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(() => dateFromParams(searchParams));
  const [exerciseAuto, setExerciseAuto] = useState<ExerciseAutoState | null>(null);
  const [exerciseAutoReady, setExerciseAutoReady] = useState(false);
  const [exerciseAutoSaving, setExerciseAutoSaving] = useState(false);
  const [exerciseAutoError, setExerciseAutoError] = useState<string | null>(null);
  const [weekDays, setWeekDays] = useState<DayExercises[]>([]);
  const [routine, setRoutine] = useState<ExerciseRoutine | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
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

  // Coach chat (and other surfaces) dispatch this after mutating the day plan.
  useEffect(() => {
    const handleUpdated = () => {
      void reloadWeek();
    };
    window.addEventListener('exercise-plan-updated', handleUpdated);
    return () => window.removeEventListener('exercise-plan-updated', handleUpdated);
  }, [reloadWeek]);

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

  const exerciseMode: ExerciseAutoMode = exerciseAuto?.mode ?? 'MANUAL';

  const loadExerciseAuto = useCallback(async () => {
    try {
      const next = await api<ExerciseAutoState>(`/api/exercise-auto?${todayDateParam()}`);
      setExerciseAuto(next);
      setExerciseAutoError(null);
    } catch (error) {
      setExerciseAutoError(error instanceof Error ? error.message : 'Could not load exercise mode.');
    } finally {
      setExerciseAutoReady(true);
    }
  }, []);

  useEffect(() => {
    void loadExerciseAuto();
  }, [loadExerciseAuto]);

  const saveExerciseAuto = useCallback(async (patch: Partial<Pick<ExerciseAutoState, 'mode' | 'location' | 'level'>>) => {
    setExerciseAutoSaving(true);
    setExerciseAutoError(null);
    try {
      const next = await api<ExerciseAutoState>(`/api/exercise-auto?${todayDateParam()}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setExerciseAuto(next);
    } catch (error) {
      setExerciseAutoError(error instanceof Error ? error.message : 'Could not save exercise mode.');
      await loadExerciseAuto();
    } finally {
      setExerciseAutoSaving(false);
    }
  }, [loadExerciseAuto]);

  const setExerciseMode = useCallback(
    (mode: ExerciseAutoMode) => {
      void saveExerciseAuto({ mode });
    },
    [saveExerciseAuto]
  );

  const setExerciseAutoLocation = useCallback(
    (locationChoice: ExerciseAutoLocation) => {
      void saveExerciseAuto({ location: locationChoice });
    },
    [saveExerciseAuto]
  );

  const setExerciseAutoLevel = useCallback(
    (level: ExerciseAutoLevel) => {
      void saveExerciseAuto({ level });
    },
    [saveExerciseAuto]
  );

  const answerExerciseCheckIn = useCallback(
    (choice: ExerciseAutoChoice) => {
      void (async () => {
        setExerciseAutoSaving(true);
        setExerciseAutoError(null);
        try {
          const next = await api<ExerciseAutoState>(`/api/exercise-auto/check-in?${todayDateParam()}`, {
            method: 'POST',
            body: JSON.stringify({ choice })
          });
          setExerciseAuto(next);
        } catch (error) {
          setExerciseAutoError(error instanceof Error ? error.message : 'Could not save that choice.');
        } finally {
          setExerciseAutoSaving(false);
        }
      })();
    },
    []
  );

  const startAutomaticWorkout = useCallback(() => {
    void (async () => {
      setExerciseAutoSaving(true);
      setExerciseAutoError(null);
      try {
        const result = await api<{ date: string }>(`/api/exercise-auto/start?${todayDateParam()}`, {
          method: 'POST'
        });
        navigate(`/exercise/session?date=${result.date}`);
      } catch (error) {
        setExerciseAutoError(error instanceof Error ? error.message : 'Could not start the workout.');
        setExerciseAutoSaving(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (exerciseMode === 'AUTOMATIC' && location.pathname.startsWith('/exercise/manage')) {
      navigate({ pathname: '/exercise', search: searchParams.toString() }, { replace: true });
    }
  }, [exerciseMode, location.pathname, navigate, searchParams]);

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
    setActionError,
    exerciseMode,
    exerciseAuto,
    exerciseAutoSaving,
    exerciseAutoError,
    setExerciseMode,
    setExerciseAutoLocation,
    setExerciseAutoLevel,
    answerExerciseCheckIn,
    startAutomaticWorkout
  };

  const currentSearch = searchParams.toString();
  const visibleTabs = exerciseMode === 'AUTOMATIC' ? TABS.filter((tab) => tab.label !== 'Manage') : TABS;
  const subtitle = !exerciseAutoReady
    ? null
    : exerciseMode === 'AUTOMATIC'
      ? "We'll build your weeks. You just show up."
      : "Start today's workout, plan your week, manage routines.";

  function handlePrint(orientation: PlanPrintOrientation) {
    setPrintError(null);
    try {
      if (orientation === 'vertical') {
        if (!exercisesForSelectedDate.length) {
          setPrintError('No exercises planned for this day.');
          return;
        }
        printExercisePlan(exercisesForSelectedDate, selectedDate);
        return;
      }
      if (!weekHasExercises(weekDays)) {
        setPrintError('No exercises planned for this week.');
        return;
      }
      printExerciseWeekPlan(weekDays, formatWeekExportLabel(weekStart));
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Could not open print view.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
            <h1 className="text-3xl font-bold text-app-text">Exercise</h1>
            {subtitle && <p className="text-app-text-muted sm:pt-1">{subtitle}</p>}
          </div>
          {exerciseAutoReady && exerciseMode === 'MANUAL' && <PlanPrintButton onPrint={handlePrint} />}
        </div>
        {exerciseAutoReady && (
          <div className="flex flex-wrap items-center gap-3">
            <ExerciseModeSwitch mode={exerciseMode} disabled={exerciseAutoSaving} onChange={setExerciseMode} />
            <nav
              aria-label="Exercise sections"
              className="inline-flex w-fit max-w-full rounded-2xl border border-app-border bg-app-surface p-1 shadow-sm"
            >
              {visibleTabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={{ pathname: tab.to, search: currentSearch }}
                  end={tab.end}
                  className={({ isActive }) =>
                    clsx(
                      'rounded-xl px-4 py-2 text-center text-base font-bold tracking-wide transition',
                      isActive
                        ? 'bg-brand-green text-white shadow-sm'
                        : 'text-app-text hover:bg-app-muted'
                    )
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
        {exerciseAutoReady && exerciseMode === 'MANUAL' && exerciseAutoError && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{exerciseAutoError}</div>
        )}
      </div>

      {loadError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>
      )}
      {printError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{printError}</div>
      )}

      {exerciseAutoReady && <Outlet context={context} />}

      <ExercisePlanUndoToast
        message={undo?.message ?? null}
        restoring={restoring}
        onUndo={performUndo}
        onDismiss={clearUndo}
      />
    </div>
  );
}
