import { useEffect, useMemo, useState } from 'react';
import { api, getWeekDates, startOfWeek } from '../../services/api';
import type { ExercisePlanSummary, ExerciseRoutine } from '../../types';
import type { DayExercises } from '../../utils/planExportData';
import { fetchCoachExercisesForDates } from '../../utils/planExportData';
import { exercisePlanApi } from '../../utils/exercisePlanApi';
import {
  assignedExercisePlan,
  exercisePlanPickerOptions,
  exercisePlanPickerValue,
  weekdayAssignmentsFromPlanDays
} from '../../utils/exerciseRoutineDisplay';
import { AssignedExerciseWeek } from '../exercise/AssignedExerciseWeek';
import { CoachDayExerciseEditor } from './CoachDayExerciseEditor';
import { Button } from '../ui/Button';

export function ExercisePlanEditorView({
  planDate,
  routine,
  weekDates,
  weekDays,
  loading,
  plans,
  planId,
  onPlanIdChange,
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
  plans: { id: string; name: string }[];
  planId: string;
  onPlanIdChange: (planId: string) => void;
  setAsDefault: boolean;
  onSetAsDefaultChange: (value: boolean) => void;
  saving: boolean;
  onApply: () => void;
  onSelectDay: (date: string) => void;
}) {
  const options = exercisePlanPickerOptions(plans, assignedExercisePlan(routine));

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
            value={planId}
            onChange={(event) => onPlanIdChange(event.target.value)}
          >
            <option value="">Choose a plan</option>
            {options.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={saving || !planId} onClick={onApply}>
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
  const [plans, setPlans] = useState<ExercisePlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [planOverride, setPlanOverride] = useState<string | null>(null);
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

  const endpoints = useMemo(() => exercisePlanApi(clientId), [clientId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [days, nextRoutine, nextPlans] = await Promise.all([
          fetchCoachExercisesForDates(clientId, weekDates),
          api<ExerciseRoutine | null>(endpoints.routine),
          api<ExercisePlanSummary[]>(endpoints.plans).catch(() => [] as ExercisePlanSummary[])
        ]);
        if (cancelled) return;
        setWeekDays(days);
        setRoutine(nextRoutine);
        setPlans(nextPlans);
      } catch (err) {
        if (cancelled) return;
        setWeekDays([]);
        setRoutine(null);
        setPlans([]);
        onError(err instanceof Error ? err.message : 'Unable to load exercises');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, endpoints.plans, endpoints.routine, onError, reloadToken, weekDates]);

  const assigned = assignedExercisePlan(routine);
  const planId = exercisePlanPickerValue(assigned?.id ?? null, planOverride);

  async function applyPlan() {
    if (!planId) {
      onError('Choose an exercise plan first.');
      return;
    }
    const plan = plans.find((entry) => entry.id === planId);
    if (!plan) {
      onError('Choose an exercise plan first.');
      return;
    }
    onSavingChange(true);
    onError('');
    try {
      await api(endpoints.routine, {
        method: 'PUT',
        body: JSON.stringify({
          days: weekdayAssignmentsFromPlanDays(plan.days),
          exercisePlanId: plan.id,
          applyForward: setAsDefault
        })
      });
      setPlanOverride(null);
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
        plans={plans}
        planId={planId}
        onPlanIdChange={setPlanOverride}
        setAsDefault={setAsDefault}
        onSetAsDefaultChange={setSetAsDefault}
        saving={saving}
        onApply={() => void applyPlan()}
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
