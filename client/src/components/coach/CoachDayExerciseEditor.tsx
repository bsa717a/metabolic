import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { LayoutTemplate, X } from 'lucide-react';
import { api, getWeekDates, startOfWeek } from '../../services/api';
import type { ExercisePlanTemplateSummary, ExerciseRoutine, ScheduledExercise } from '../../types';
import { DayExerciseEditor } from '../exercise/DayExerciseEditor';
import { RoutineEditorContent } from '../exercise/RoutineEditor';
import { WeekAgendaList } from '../exercise/weekly/WeekAgendaList';
import { PlanPrintMenu } from '../export/PlanPrintMenu';
import { CopyWeekPlanMenu } from '../plan/CopyWeekPlanMenu';
import { Button } from '../ui/Button';
import { coachDailyExercisesApi, coachRestoreExercisePlanApi } from '../../utils/coachExerciseApi';
import { fetchCoachExercisesForDates, formatWeekExportLabel, weekHasExercises } from '../../utils/planExportData';
import { printExercisePlan, printExerciseWeekPlan } from '../../utils/printExercisePlan';
import type { PublishPlanPayload } from '../../utils/weekdayPattern';
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
  exerciseTemplates,
  onClose,
  onRefresh
}: {
  open: boolean;
  clientId: string;
  planDate: string;
  exerciseTemplates: ExercisePlanTemplateSummary[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [selectedDate, setSelectedDate] = useState(planDate);
  const [activeTab, setActiveTab] = useState<ExerciseEditorTab>('today');
  const [weekDays, setWeekDays] = useState<Awaited<ReturnType<typeof fetchCoachExercisesForDates>>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
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
      setActiveTab('today');
    }
  }, [open, planDate]);

  useEffect(() => {
    if (!open) return;
    void reloadWeek();
    setTemplateOpen(false);
    setActionError(null);
    setPrintError(null);
  }, [open, reloadWeek]);

  useEffect(() => {
    if (!open) return;
    void reloadRoutine();
  }, [clientId, open, reloadRoutine]);

  useEffect(() => {
    setTemplateId((current) => current || exerciseTemplates[0]?.id || '');
  }, [exerciseTemplates, open]);

  const exercises = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.exercises ?? [],
    [weekDays, selectedDate]
  );

  async function removeExercise(id: string) {
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
  }

  async function publishPlan(payload: PublishPlanPayload) {
    setActionError(null);

    if (payload.targetDates.length === 0 && payload.clearDates.length > 0) {
      if (!window.confirm(`Clear exercises on ${payload.clearDates.length} day(s)?`)) return false;
    } else if (payload.targetDates.length > 0) {
      const loggedTargets = payload.targetDates.filter((date) => {
        const day = weekDays.find((entry) => entry.date === date);
        return day?.exercises.some((item) => item.status !== 'PLANNED');
      });

      const replaceMessage =
        loggedTargets.length > 0
          ? `Some target days already have logged exercises. Replace ${payload.targetDates.length} day(s) anyway?`
          : `Replace exercises on ${payload.targetDates.length} day(s)?`;

      if (!window.confirm(replaceMessage)) return false;
    }

    const result = await api<ExercisePlanUndoResponse & { copiedDays?: number; clearedDays?: number }>(
      coachDailyExercisesApi(clientId, selectedDate, '/copy-to-dates'),
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    registerUndo(
      exercisePlanUndoMessage(result.undoSnapshot?.days.length ?? 0, 'Plan updated'),
      result.undoSnapshot
    );
    await reloadWeek();
  }

  async function handleApplyTemplate() {
    if (!templateId || applyingTemplate) return;
    setApplyingTemplate(true);
    setLoadError(null);
    try {
      const result = await api<ExercisePlanUndoResponse & { exercises: ScheduledExercise[] }>(
        `/api/coach/users/${clientId}/daily-logs/${selectedDate}/apply-exercise-template`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId, setAsDefault })
        }
      );
      registerUndo(
        exercisePlanUndoMessage(result.undoSnapshot?.days.length ?? 1, 'Plan applied'),
        result.undoSnapshot
      );
      await reloadWeek();
      await onRefresh();
      setTemplateOpen(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not apply plan.');
    } finally {
      setApplyingTemplate(false);
    }
  }

  const defaultTemplateName = useMemo(() => {
    const match = exerciseTemplates.find((template) => template.id === templateId);
    return match?.name;
  }, [exerciseTemplates, templateId]);

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
          <div className="flex flex-wrap items-center gap-2">
            <CopyWeekPlanMenu
              sourceDate={selectedDate}
              planLabel="exercises"
              hasSourcePlan={exercises.length > 0}
              disabled={Boolean(removingId)}
              onCopy={publishPlan}
            />
            <Button type="button" variant="secondary" onClick={() => setTemplateOpen(true)}>
              <LayoutTemplate className="mr-1 inline h-4 w-4" />
              Plans
            </Button>
            <button
              type="button"
              aria-label="Close editor"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
              onClick={() => void handleClose()}
            >
              <X size={18} />
            </button>
          </div>
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
                defaultTemplateName || routineSummaryLabel(routine) ? (
                  <div className="space-y-1">
                    {defaultTemplateName && (
                      <p className="text-sm text-app-text-muted">
                        Default plan: <span className="font-medium text-app-text">{defaultTemplateName}</span>
                      </p>
                    )}
                    {routine && routineSummaryLabel(routine) && (
                      <p className="text-sm text-app-text-muted">
                        Weekly routine:{' '}
                        <span className="font-medium text-app-text">{routineSummaryLabel(routine)}</span>
                      </p>
                    )}
                  </div>
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

      {templateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setTemplateOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-app-border bg-app-surface p-6 shadow-xl">
            <h3 className="text-lg font-bold text-app-text">Apply exercise plan</h3>
            <p className="mt-1 text-sm text-app-text-muted">
              Replace planned exercises for <strong>{selectedDate}</strong>.
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Plan</span>
              <select
                className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                disabled={applyingTemplate}
              >
                {exerciseTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(event) => setSetAsDefault(event.target.checked)}
                disabled={applyingTemplate}
              />
              Set as the user&apos;s default going forward
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={applyingTemplate}
                onClick={() => setTemplateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={applyingTemplate || !templateId}
                onClick={() => void handleApplyTemplate()}
              >
                {applyingTemplate ? 'Applying…' : 'Apply plan'}
              </Button>
            </div>
          </div>
        </div>
      )}

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
