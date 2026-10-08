import { useEffect, useMemo, useState } from 'react';
import { api, getWeekDates, startOfWeek } from '../../services/api';
import type { ExercisePlanTemplateSummary, ExerciseRoutine, ScheduledExercise } from '../../types';
import type { DayExercises } from '../../utils/planExportData';
import { fetchCoachExercisesForDates } from '../../utils/planExportData';
import { assignedTemplateIdForDate } from '../../utils/exerciseRoutineDisplay';
import { weekdayIndex } from '../../utils/weekdayPattern';
import { AssignedExerciseWeek } from '../exercise/AssignedExerciseWeek';
import { CoachDayExerciseEditor } from './CoachDayExerciseEditor';
import { Button } from '../ui/Button';

export function ExercisePlanEditorView({
  planDate,
  routine,
  weekDates,
  weekDays,
  loading,
  exerciseTemplates,
  templateId,
  onTemplateIdChange,
  setAsDefault,
  onSetAsDefaultChange,
  saving,
  onApply,
  onSelectDay
}: {
  planDate: string;
  routine: ExerciseRoutine | null;
  weekDates: string[];
  weekDays: DayExercises[];
  loading: boolean;
  exerciseTemplates: ExercisePlanTemplateSummary[];
  templateId: string;
  onTemplateIdChange: (templateId: string) => void;
  setAsDefault: boolean;
  onSetAsDefaultChange: (value: boolean) => void;
  saving: boolean;
  onApply: () => void;
  onSelectDay: (date: string) => void;
}) {
  const assignedTemplate = routine?.days.find((day) => day.weekday === weekdayIndex(planDate))?.template ?? null;
  const templates =
    assignedTemplate && !exerciseTemplates.some((template) => template.id === assignedTemplate.id)
      ? [assignedTemplate, ...exerciseTemplates]
      : exerciseTemplates;

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-app-text-muted">Loading exercises...</p>
      ) : (
        <AssignedExerciseWeek
          routine={routine}
          weekDates={weekDates}
          days={weekDays}
          selectedDate={planDate}
          onSelectDay={onSelectDay}
          intro="Your week at a glance. Tap any day to open and edit it."
        />
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block font-medium">Exercise plan</span>
          <select
            className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
            value={templateId}
            onChange={(event) => onTemplateIdChange(event.target.value)}
          >
            <option value="">Choose a plan</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={saving || !templateId} onClick={onApply}>
          Apply plan
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={setAsDefault} onChange={(event) => onSetAsDefaultChange(event.target.checked)} />
        Set as the user&apos;s default going forward
      </label>
    </div>
  );
}

export function ExercisePlanEditor({
  clientId,
  planDate,
  exerciseTemplates,
  saving,
  manualOpen,
  onManualOpenChange,
  onSavingChange,
  onError,
  onRefresh,
  onPlanDateChange
}: {
  clientId: string;
  planDate: string;
  exerciseTemplates: ExercisePlanTemplateSummary[];
  saving: boolean;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  onPlanDateChange: (date: string) => void;
}) {
  const [weekDays, setWeekDays] = useState<DayExercises[]>([]);
  const [routine, setRoutine] = useState<ExerciseRoutine | null>(null);
  const [loading, setLoading] = useState(true);
  const [templateOverride, setTemplateOverride] = useState<{ date: string; id: string } | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const weekStart = startOfWeek(planDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const weekKey = `${clientId}:${weekStart}:${reloadToken}`;
  const [requestedKey, setRequestedKey] = useState(weekKey);
  if (requestedKey !== weekKey) {
    setRequestedKey(weekKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [days, nextRoutine] = await Promise.all([
          fetchCoachExercisesForDates(clientId, weekDates),
          api<ExerciseRoutine | null>(`/api/coach/users/${clientId}/exercise-routine`)
        ]);
        if (cancelled) return;
        setWeekDays(days);
        setRoutine(nextRoutine);
      } catch (err) {
        if (cancelled) return;
        setWeekDays([]);
        setRoutine(null);
        onError(err instanceof Error ? err.message : 'Unable to load exercises');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, onError, reloadToken, weekDates]);

  const assignedId = assignedTemplateIdForDate(routine, planDate) ?? '';
  const templateId = templateOverride?.date === planDate ? templateOverride.id : assignedId;

  async function applyTemplate() {
    if (!templateId) {
      onError('Choose an exercise plan first.');
      return;
    }
    onSavingChange(true);
    onError('');
    try {
      await api<{ exercises: ScheduledExercise[] }>(
        `/api/coach/users/${clientId}/daily-logs/${planDate}/apply-exercise-template`,
        {
          method: 'POST',
          body: JSON.stringify({ templateId, setAsDefault })
        }
      );
      setReloadToken((token) => token + 1);
      await onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to apply exercise plan');
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <>
      <ExercisePlanEditorView
        planDate={planDate}
        routine={routine}
        weekDates={weekDates}
        weekDays={weekDays}
        loading={loading}
        exerciseTemplates={exerciseTemplates}
        templateId={templateId}
        onTemplateIdChange={(id) => setTemplateOverride({ date: planDate, id })}
        setAsDefault={setAsDefault}
        onSetAsDefaultChange={setSetAsDefault}
        saving={saving}
        onApply={() => void applyTemplate()}
        onSelectDay={onPlanDateChange}
      />

      <CoachDayExerciseEditor
        open={manualOpen}
        clientId={clientId}
        planDate={planDate}
        onClose={() => {
          onManualOpenChange(false);
          setReloadToken((token) => token + 1);
        }}
        onRefresh={onRefresh}
      />
    </>
  );
}
