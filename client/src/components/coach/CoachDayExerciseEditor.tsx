import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { CalendarDays, LayoutTemplate, X } from 'lucide-react';
import { api, getWeekDates, isToday, startOfWeek } from '../../services/api';
import type { ExercisePlanTemplateSummary, ExerciseRoutine, ScheduledExercise } from '../../types';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import { ExerciseChecklist } from '../exercise/ExerciseChecklist';
import { CopyWeekPlanMenu } from '../plan/CopyWeekPlanMenu';
import { AddExerciseDrawer } from '../exercise/AddExerciseDrawer';
import { EditExerciseDrawer } from '../exercise/EditExerciseDrawer';
import { RoutineEditor } from '../exercise/RoutineEditor';
import { WeeklyExercisePlanner } from '../exercise/weekly/WeeklyExercisePlanner';
import { Button } from '../ui/Button';
import { coachDailyExercisesApi, coachRestoreExercisePlanApi } from '../../utils/coachExerciseApi';
import {
  type DayExercises,
  fetchCoachExercisesForDates
} from '../../utils/planExportData';
import type { PublishPlanPayload } from '../../utils/weekdayPattern';
import { weekdayIndex } from '../../utils/weekdayPattern';
import { exercisePlanUndoMessage, useExercisePlanUndo } from '../../hooks/useExercisePlanUndo';
import { ExercisePlanUndoToast } from '../exercise/ExercisePlanUndoToast';
import type { ExercisePlanUndoResponse } from '../../types/exercisePlanUndo';

type View = 'week' | 'day';

function routineRestDatesForWeek(routine: ExerciseRoutine | null, weekDates: string[]) {
  if (!routine?.days.length) return new Set<string>();
  const byWeekday = new Map(routine.days.map((day) => [day.weekday, day.templateId]));
  const restDates = new Set<string>();
  for (const date of weekDates) {
    if (byWeekday.get(weekdayIndex(date)) === null) restDates.add(date);
  }
  return restDates;
}

function routineSummaryLabel(routine: ExerciseRoutine | null) {
  if (!routine?.days.length) return null;
  const parts: string[] = [];
  const counts = new Map<string, number>();
  for (const day of routine.days) {
    const key = day.templateId ?? 'rest';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (key === 'rest') {
      parts.push(`${count} rest`);
    } else {
      const name = routine.days.find((day) => day.templateId === key)?.template?.name ?? 'Workout';
      parts.push(`${count}× ${name}`);
    }
  }
  return parts.join(' · ');
}

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
  const [view, setView] = useState<View>('week');
  const [weekDays, setWeekDays] = useState<DayExercises[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledExercise>();
  const [editDayMode, setEditDayMode] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [routineEditorOpen, setRoutineEditorOpen] = useState(false);
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

  useEffect(() => {
    if (open) setSelectedDate(planDate);
  }, [open, planDate]);

  useEffect(() => {
    if (!open) return;
    void reloadWeek();
    setEditItem(undefined);
    setAddOpen(false);
    setEditDayMode(false);
    setTemplateOpen(false);
    setRoutineEditorOpen(false);
  }, [open, reloadWeek]);

  useEffect(() => {
    if (!open) return;
    api<ExerciseRoutine | null>(`/api/coach/users/${clientId}/exercise-routine`)
      .then(setRoutine)
      .catch(() => setRoutine(null));
  }, [clientId, open, weekDays]);

  useEffect(() => {
    setTemplateId((current) => current || exerciseTemplates[0]?.id || '');
  }, [exerciseTemplates, open]);

  const exercises = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.exercises ?? [],
    [weekDays, selectedDate]
  );

  useEffect(() => {
    setEditDayMode(false);
  }, [selectedDate]);

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
      if (editItem?.id === id) setEditItem(undefined);
      if (exercises.length <= 1) setEditDayMode(false);
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

  const doneCount = exercises.filter((item) => item.status === 'DONE').length;
  const progress = exercises.length ? Math.round((doneCount / exercises.length) * 100) : 0;

  const defaultTemplateName = useMemo(() => {
    const match = exerciseTemplates.find((template) => template.id === templateId);
    return match?.name;
  }, [exerciseTemplates, templateId]);

  async function handleClose() {
    await onRefresh();
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-app-bg">
      <header className="shrink-0 border-b border-app-border bg-app-surface px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-app-text">Edit exercise plan</h2>
            <p className="text-sm text-app-text-muted">Plan workouts for this client.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setRoutineEditorOpen(true)}>
              <CalendarDays className="mr-1 inline h-4 w-4" />
              Routine
            </Button>
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
        <div className="mx-auto max-w-7xl space-y-4">
          <WeekDateStrip
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            exerciseDays={weekDays}
            endAction={
              <div className="inline-flex rounded-xl bg-app-muted p-1">
                {(['week', 'day'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={clsx(
                      'rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition',
                      view === option ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-text-muted hover:text-app-text'
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            }
          />

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

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAddOpen(true)}>Add exercise</Button>
            <Button type="button" variant="secondary" onClick={() => setRoutineEditorOpen(true)}>
              Edit routine
            </Button>
            <CopyWeekPlanMenu
              sourceDate={selectedDate}
              planLabel="exercises"
              hasSourcePlan={exercises.length > 0}
              disabled={editDayMode}
              onCopy={publishPlan}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditDayMode((value) => !value)}
            >
              {editDayMode ? 'Done editing' : 'Edit day'}
            </Button>
          </div>

          {editDayMode && (
            <p className="text-sm text-red-700">Tap the red × to remove exercises from this day.</p>
          )}

          {view === 'day' && exercises.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="font-semibold text-slate-900">
                  {doneCount} of {exercises.length} done
                </p>
                {!isToday(selectedDate) && <p className="text-slate-400">{selectedDate}</p>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {(loadError || actionError) && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {actionError ?? loadError}
            </div>
          )}

          {view === 'week' ? (
            <WeeklyExercisePlanner
              weekDates={weekDates}
              days={weekDays}
              selectedDate={selectedDate}
              editDayMode={editDayMode}
              removingId={removingId}
              onSelectDay={setSelectedDate}
              onChange={reloadWeek}
              onEdit={setEditItem}
              onRemove={removeExercise}
              routineRestDates={routineRestDates}
            />
          ) : (
            <ExerciseChecklist
              exercises={exercises}
              selectedDate={selectedDate}
              coachClientId={clientId}
              editDayMode={editDayMode}
              onChange={reloadWeek}
              onEdit={setEditItem}
              onRemove={removeExercise}
            />
          )}
        </div>
      </div>

      <AddExerciseDrawer
        open={addOpen}
        date={selectedDate}
        coachClientId={clientId}
        onClose={() => setAddOpen(false)}
        onSaved={reloadWeek}
      />

      <EditExerciseDrawer
        open={Boolean(editItem)}
        item={editItem}
        onClose={() => setEditItem(undefined)}
        onSaved={reloadWeek}
        onRemove={removeExercise}
      />

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

      <RoutineEditor
        open={routineEditorOpen}
        selectedDate={selectedDate}
        clientId={clientId}
        onClose={() => setRoutineEditorOpen(false)}
        onSaved={async () => {
          const nextRoutine = await api<ExerciseRoutine | null>(`/api/coach/users/${clientId}/exercise-routine`);
          setRoutine(nextRoutine);
          await reloadWeek();
        }}
        registerUndo={registerUndo}
      />

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
