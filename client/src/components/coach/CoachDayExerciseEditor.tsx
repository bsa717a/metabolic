import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { api, getWeekDates, startOfWeek } from '../../services/api';
import type { ExerciseRoutine } from '../../types';
import { DayExerciseEditor } from '../exercise/DayExerciseEditor';
import { RoutineEditorContent } from '../exercise/RoutineEditor';
import { WeekAgendaList } from '../exercise/weekly/WeekAgendaList';
import { PlanPrintMenu } from '../export/PlanPrintMenu';
import { coachRestoreExercisePlanApi } from '../../utils/coachExerciseApi';
import { fetchCoachExercisesForDates, formatWeekExportLabel, weekHasExercises } from '../../utils/planExportData';
import { printExercisePlan, printExerciseWeekPlan } from '../../utils/printExercisePlan';
import { routineRestDatesForWeek, routineSummaryLabel } from '../../utils/exerciseRoutineDisplay';
import { exercisePlanUndoMessage, useExercisePlanUndo } from '../../hooks/useExercisePlanUndo';
import { ExercisePlanUndoToast } from '../exercise/ExercisePlanUndoToast';
import type { ExercisePlanUndoResponse } from '../../types/exercisePlanUndo';

type ExerciseEditorTab = 'today' | 'plan' | 'manage';

const EXERCISE_TABS: { id: ExerciseEditorTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'plan', label: 'Plan' },
  { id: 'manage', label: 'Manage' }
];

export function CoachDayExerciseEditor({
  open,
  clientId,
  planDate,
  onClose,
  onRefresh
}: {
  open: boolean;
  clientId: string;
  planDate: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [selectedDate, setSelectedDate] = useState(planDate);
  const [activeTab, setActiveTab] = useState<ExerciseEditorTab>('manage');
  const [weekDays, setWeekDays] = useState<Awaited<ReturnType<typeof fetchCoachExercisesForDates>>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [routine, setRoutine] = useState<ExerciseRoutine | null>(null);

  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const routineRestDates = useMemo(() => routineRestDatesForWeek(routine, weekDates), [routine, weekDates]);

  const reloadWeek = useCallback(async () => {
    try {
      const data = await fetchCoachExercisesForDates(clientId, weekDates);
      setWeekDays(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load exercises.');
    }
  }, [clientId, weekDates]);

  const { undo, registerUndo, performUndo, restoring, clearUndo } = useExercisePlanUndo({
    restoreUrl: coachRestoreExercisePlanApi(clientId),
    onRestored: reloadWeek
  });

  const reloadRoutine = useCallback(async () => {
    try {
      const next = await api<ExerciseRoutine | null>(`/api/coach/users/${clientId}/exercise-routine`);
      setRoutine(next);
    } catch {
      setRoutine(null);
    }
  }, [clientId]);

  useEffect(() => {
    if (open) {
      setSelectedDate(planDate);
      setActiveTab('manage');
    }
  }, [open, planDate]);

  useEffect(() => {
    if (!open) return;
    void reloadWeek();
    setActionError(null);
    setPrintError(null);
  }, [open, reloadWeek]);

  useEffect(() => {
    if (!open) return;
    void reloadRoutine();
  }, [clientId, open, reloadRoutine]);

  const exercises = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.exercises ?? [],
    [weekDays, selectedDate]
  );

  async function removeExercise(id: string) {
    setActionError(null);
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
    }
  }

  async function handleClose() {
    await onRefresh();
    onClose();
  }

  function openDay(date: string) {
    setSelectedDate(date);
    setActiveTab('today');
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
      if (!weekHasExercises(weekDays)) {
        setPrintError('No exercises planned for this week.');
        return;
      }
      printExerciseWeekPlan(weekDays, formatWeekExportLabel(weekStart));
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Could not open print view.');
    } finally {
      setPrinting(null);
    }
  }

  async function handleRoutineSaved() {
    await Promise.all([reloadRoutine(), reloadWeek()]);
  }

  if (!open) return null;

  const displayError = activeTab === 'today' ? actionError ?? loadError : loadError;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-app-bg">
      <header className="shrink-0 border-b border-app-border bg-app-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-app-text">Edit exercise plan</h2>
            <p className="text-sm text-app-text-muted">
              Same Exercise experience your client sees — Today, Plan, and Manage.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close editor"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
            onClick={() => void handleClose()}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <nav
            aria-label="Exercise sections"
            className="inline-flex w-fit max-w-full rounded-2xl border border-app-border bg-app-surface p-1 shadow-sm"
          >
            {EXERCISE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'rounded-xl px-4 py-2 text-center text-base font-bold tracking-wide transition',
                  activeTab === tab.id
                    ? 'bg-brand-green text-white shadow-sm'
                    : 'text-app-text hover:bg-app-muted'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'today' && (
            <DayExerciseEditor
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              weekDays={weekDays}
              exercises={exercises}
              onReload={reloadWeek}
              onRemoveExercise={removeExercise}
              coachClientId={clientId}
              actionError={displayError}
              onClearActionError={() => {
                setActionError(null);
                setLoadError(null);
              }}
              beforeChecklist={
                routine && routineSummaryLabel(routine) ? (
                  <p className="text-sm text-app-text-muted">
                    Weekly routine:{' '}
                    <span className="font-medium text-app-text">{routineSummaryLabel(routine)}</span>
                  </p>
                ) : null
              }
            />
          )}

          {activeTab === 'plan' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-app-text-muted">
                  Your week at a glance. Tap any day to open and edit it.
                </p>
                <PlanPrintMenu printing={printing} onPrintDay={handlePrintDay} onPrintWeek={handlePrintWeek} />
              </div>

              {printError && (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{printError}</div>
              )}

              {loadError && (
                <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>
              )}

              <WeekAgendaList
                weekDates={weekDates}
                days={weekDays}
                selectedDate={selectedDate}
                routineRestDates={routineRestDates}
                onSelectDay={openDay}
              />
            </div>
          )}

          <div className={activeTab === 'manage' ? 'space-y-4' : 'hidden'}>
            <p className="text-sm text-app-text-muted">
              Manage reusable workouts, then choose which one runs on each weekday.
            </p>
            <RoutineEditorContent
              active={open}
              selectedDate={selectedDate}
              clientId={clientId}
              onSaved={handleRoutineSaved}
              registerUndo={registerUndo}
            />
          </div>
        </div>
      </div>

      <ExercisePlanUndoToast
        message={undo?.message ?? null}
        restoring={restoring}
        onUndo={performUndo}
        onDismiss={clearUndo}
      />
    </div>,
    document.body
  );
}
