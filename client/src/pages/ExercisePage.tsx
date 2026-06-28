import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { LayoutTemplate } from 'lucide-react';
import { api, getWeekDates, isToday, startOfWeek, todayKey } from '../services/api';
import type { ExercisePlanTemplateSummary, ScheduledExercise } from '../types';
import { WeekDateStrip } from '../components/nutrition/WeekDateStrip';
import { ExerciseChecklist } from '../components/exercise/ExerciseChecklist';
import { CopyWeekPlanMenu } from '../components/plan/CopyWeekPlanMenu';
import { AddExerciseDrawer } from '../components/exercise/AddExerciseDrawer';
import { EditExerciseDrawer } from '../components/exercise/EditExerciseDrawer';
import { ApplyExerciseTemplateModal } from '../components/exercise/ApplyExerciseTemplateModal';
import { WeeklyExercisePlanner } from '../components/exercise/weekly/WeeklyExercisePlanner';
import { PlanPrintMenu } from '../components/export/PlanPrintMenu';
import { Button } from '../components/ui/Button';
import {
  type DayExercises,
  fetchExercisesForDates,
  formatWeekExportLabel,
  getWeekRange,
  weekHasExercises
} from '../utils/planExportData';
import { printExercisePlan, printExerciseWeekPlan } from '../utils/printExercisePlan';
import type { PublishPlanPayload } from '../utils/weekdayPattern';
import { exercisePlanUndoMessage, useExercisePlanUndo } from '../hooks/useExercisePlanUndo';
import { ExercisePlanUndoToast } from '../components/exercise/ExercisePlanUndoToast';
import type { ExercisePlanUndoResponse } from '../types/exercisePlanUndo';

function dateFromParams(params: URLSearchParams) {
  const date = params.get('date');
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
}

type View = 'week' | 'day';

export function ExercisePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => dateFromParams(searchParams));
  const [view, setView] = useState<View>('week');
  const [weekDays, setWeekDays] = useState<DayExercises[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ScheduledExercise>();
  const [editDayMode, setEditDayMode] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [defaultTemplate, setDefaultTemplate] = useState<ExercisePlanTemplateSummary | null>(null);

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

  const { undo, registerUndo, performUndo, restoring, clearUndo } = useExercisePlanUndo({
    restoreUrl: '/api/daily-logs/exercises/restore-snapshot',
    onRestored: reloadWeek
  });

  useEffect(() => {
    const date = dateFromParams(searchParams);
    setSelectedDate(date);
  }, [searchParams]);

  useEffect(() => {
    void reloadWeek();
  }, [reloadWeek]);

  const exercises = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.exercises ?? [],
    [weekDays, selectedDate]
  );

  useEffect(() => {
    api<ExercisePlanTemplateSummary | null>('/api/exercise-templates/default')
      .then(setDefaultTemplate)
      .catch(() => setDefaultTemplate(null));
  }, [selectedDate, weekDays]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setSearchParams(date === todayKey() ? {} : { date }, { replace: true });
  }

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
      `/api/daily-logs/${selectedDate}/exercises/copy-to-dates`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    const dayCount = result.undoSnapshot?.days.length ?? 0;
    registerUndo(exercisePlanUndoMessage(dayCount, 'Plan updated'), result.undoSnapshot);
    await reloadWeek();
  }

  const doneCount = exercises.filter((item) => item.status === 'DONE').length;
  const progress = exercises.length ? Math.round((doneCount / exercises.length) * 100) : 0;

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
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
        <h1 className="text-3xl font-bold">Exercise</h1>
        <p className="text-slate-500 sm:pt-1">Plan your week and check off workouts as you go.</p>
      </div>

      <WeekDateStrip
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        exerciseDays={weekDays}
        endAction={
          <div className="flex gap-2">
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
            <PlanPrintMenu printing={printing} onPrintDay={handlePrintDay} onPrintWeek={handlePrintWeek} />
            <Button type="button" variant="secondary" onClick={() => setTemplateModalOpen(true)}>
              <LayoutTemplate className="mr-1 inline h-4 w-4" />
              Plans
            </Button>
          </div>
        }
      />

      {defaultTemplate && (
        <p className="text-sm text-slate-500">
          Default plan: <span className="font-medium text-slate-700">{defaultTemplate.name}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAddOpen(true)}>Add exercise</Button>
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
          disabled={!exercises.length}
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

      {(loadError || actionError || printError) && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {printError ?? actionError ?? loadError}
        </div>
      )}

      {view === 'week' ? (
        <WeeklyExercisePlanner
          weekDates={weekDates}
          days={weekDays}
          selectedDate={selectedDate}
          editDayMode={editDayMode}
          removingId={removingId}
          onSelectDay={selectDate}
          onChange={reloadWeek}
          onEdit={setEditItem}
          onRemove={removeExercise}
        />
      ) : (
        <ExerciseChecklist
          exercises={exercises}
          selectedDate={selectedDate}
          editDayMode={editDayMode}
          onChange={reloadWeek}
          onEdit={setEditItem}
          onRemove={removeExercise}
        />
      )}

      <AddExerciseDrawer
        open={addOpen}
        date={selectedDate}
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

      <ApplyExerciseTemplateModal
        open={templateModalOpen}
        selectedDate={selectedDate}
        exercises={exercises}
        onClose={() => setTemplateModalOpen(false)}
        onApplied={reloadWeek}
        registerUndo={registerUndo}
      />

      <ExercisePlanUndoToast
        message={undo?.message ?? null}
        restoring={restoring}
        onUndo={performUndo}
        onDismiss={clearUndo}
      />
    </div>
  );
}
