import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { api } from '../../services/api';
import type { ExercisePlanSummary, ExercisePlanTemplateSummary, ExerciseRoutine } from '../../types';
import type { ExercisePlanUndoSnapshot } from '../../types/exercisePlanUndo';
import { exercisePlanApi } from '../../utils/exercisePlanApi';
import { WEEKDAY_LABELS, type WeekdayIndex } from '../../utils/weekdayPattern';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { InlineWorkoutEditor } from './InlineWorkoutEditor';

const REST_VALUE = '';
const CUSTOM_PLAN_VALUE = '__custom__';

type DayAssignment = {
  weekday: WeekdayIndex;
  templateId: string | null;
};

function defaultAssignments(): DayAssignment[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as WeekdayIndex,
    templateId: null
  }));
}

function assignmentsFromRoutine(routine: ExerciseRoutine | null): DayAssignment[] {
  if (!routine?.days.length) return defaultAssignments();
  const byWeekday = new Map(routine.days.map((day) => [day.weekday, day.templateId]));
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as WeekdayIndex,
    templateId: byWeekday.get(weekday) ?? null
  }));
}

function routineSummary(days: DayAssignment[], workouts: ExercisePlanTemplateSummary[]) {
  const workoutName = (id: string | null) =>
    id ? workouts.find((w) => w.id === id)?.name ?? 'Workout' : 'Rest';
  const counts = new Map<string, number>();
  for (const day of days) {
    const key = day.templateId ?? REST_VALUE;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [key, count] of counts) {
    if (key === REST_VALUE) {
      parts.push(`${count} rest day${count > 1 ? 's' : ''}`);
    } else {
      parts.push(`${count}× ${workoutName(key)}`);
    }
  }
  return parts.join(' · ');
}

function workoutsForPlan(
  planId: string | null,
  plans: ExercisePlanSummary[],
  workouts: ExercisePlanTemplateSummary[]
) {
  if (!planId) {
    // Custom: only user-built workouts, never global/imported catalog days.
    return workouts.filter((workout) => workout.visibility === 'USER' && !workout.planId);
  }
  const plan = plans.find((entry) => entry.id === planId);
  if (!plan) return [];
  return [...plan.days].sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
}

/** Prefer persisted plan; else infer when all assigned days belong to one plan. */
function resolveSelectedPlanId(
  routine: ExerciseRoutine | null,
  templates: ExercisePlanTemplateSummary[]
): string | null {
  if (routine?.exercisePlanId) return routine.exercisePlanId;
  const assignedIds = (routine?.days ?? [])
    .map((day) => day.templateId)
    .filter((id): id is string => Boolean(id));
  if (!assignedIds.length) return null;
  const byId = new Map(templates.map((template) => [template.id, template]));
  const planIds = new Set<string>();
  for (const id of assignedIds) {
    const planId = byId.get(id)?.planId;
    if (!planId) return null;
    planIds.add(planId);
  }
  return planIds.size === 1 ? [...planIds][0]! : null;
}

/**
 * The routine-editing body (weekday assignments + reusable workouts). Rendered
 * inline on the Manage tab, and inside a Drawer by {@link RoutineEditor} for the
 * coach path. `onCancel`, when provided, shows a Cancel button and is also
 * invoked after a successful save (used by the drawer to close itself).
 */
export function RoutineEditorContent({
  active,
  selectedDate,
  clientId,
  onSaved,
  onCancel,
  registerUndo
}: {
  active: boolean;
  selectedDate: string;
  clientId?: string;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
  registerUndo?: (message: string, snapshot: ExercisePlanUndoSnapshot | undefined) => void;
}) {
  const [workouts, setWorkouts] = useState<ExercisePlanTemplateSummary[]>([]);
  const [plans, setPlans] = useState<ExercisePlanSummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<DayAssignment[]>(defaultAssignments);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [saveFromDayName, setSaveFromDayName] = useState('');
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);

  const dayOptions = useMemo(
    () => workoutsForPlan(selectedPlanId, plans, workouts),
    [selectedPlanId, plans, workouts]
  );

  const summary = useMemo(() => routineSummary(assignments, dayOptions), [assignments, dayOptions]);

  const myWorkouts = useMemo(
    () => workouts.filter((workout) => workout.visibility === 'USER' && !workout.planId),
    [workouts]
  );

  const endpoints = useMemo(() => exercisePlanApi(clientId), [clientId]);
  const workoutsLabel = clientId ? 'Client workouts' : 'My workouts';

  async function reloadWorkouts() {
    const [templates, nextPlans] = await Promise.all([
      api<ExercisePlanTemplateSummary[]>(endpoints.templates),
      api<ExercisePlanSummary[]>(endpoints.plans)
    ]);
    setWorkouts(templates);
    setPlans(nextPlans);
  }

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setError('');
    Promise.all([
      api<ExerciseRoutine | null>(endpoints.routine),
      api<ExercisePlanTemplateSummary[]>(endpoints.templates),
      api<ExercisePlanSummary[]>(endpoints.plans)
    ])
      .then(([routine, templates, nextPlans]) => {
        setWorkouts(templates);
        setPlans(nextPlans);
        setAssignments(assignmentsFromRoutine(routine));
        setSelectedPlanId(resolveSelectedPlanId(routine, templates));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load routine');
      })
      .finally(() => setLoading(false));
  }, [active, endpoints.routine, endpoints.templates, endpoints.plans]);

  function setDayTemplate(weekday: WeekdayIndex, value: string) {
    setSaved(false);
    setAssignments((current) =>
      current.map((day) =>
        day.weekday === weekday ? { ...day, templateId: value === REST_VALUE ? null : value } : day
      )
    );
  }

  function handlePlanChange(nextValue: string) {
    const nextPlanId = nextValue === CUSTOM_PLAN_VALUE ? null : nextValue;
    const allowed = new Set(workoutsForPlan(nextPlanId, plans, workouts).map((workout) => workout.id));
    const invalid = assignments.some((day) => day.templateId && !allowed.has(day.templateId));
    if (
      invalid &&
      !window.confirm('Switching plans clears weekday assignments that are not in the new plan. Continue?')
    ) {
      return;
    }
    setSelectedPlanId(nextPlanId);
    setSaved(false);
    if (invalid) {
      setAssignments((current) =>
        current.map((day) =>
          day.templateId && !allowed.has(day.templateId) ? { ...day, templateId: null } : day
        )
      );
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const result = await api<{ routine: ExerciseRoutine; undoSnapshot?: ExercisePlanUndoSnapshot }>(
        endpoints.routine,
        {
          method: 'PUT',
          body: JSON.stringify({
            days: assignments.map((day) => ({
              weekday: day.weekday,
              templateId: day.templateId
            })),
            exercisePlanId: selectedPlanId,
            applyForward: true
          })
        }
      );
      registerUndo?.('Weekly routine updated', result.undoSnapshot);
      setAssignments(assignmentsFromRoutine(result.routine));
      setSelectedPlanId(result.routine.exercisePlanId ?? null);
      setSaved(true);
      await onSaved();
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save routine');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateWorkout() {
    const name = newWorkoutName.trim();
    if (!name) return;
    setCreatingWorkout(true);
    setError('');
    try {
      const created = await api<{ id: string; name: string; items: unknown[] }>(endpoints.createTemplate, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      await reloadWorkouts();
      setNewWorkoutName('');
      setEditingWorkoutId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create workout');
    } finally {
      setCreatingWorkout(false);
    }
  }

  async function handleSaveFromDay() {
    const name = saveFromDayName.trim();
    if (!name) return;
    setCreatingWorkout(true);
    setError('');
    try {
      const created = await api<{ id: string; name: string }>(endpoints.fromDay, {
        method: 'POST',
        body: JSON.stringify({ name, date: selectedDate })
      });
      await reloadWorkouts();
      setSaveFromDayName('');
      setEditingWorkoutId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save workout from this day');
    } finally {
      setCreatingWorkout(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-app-border bg-app-muted/40 p-4">
          <h3 className="text-sm font-semibold text-app-text">{workoutsLabel}</h3>
          <p className="text-xs text-app-text-muted">
            Workouts are reusable exercise lists. Add exercises on any day, then save that day as a workout
            to reuse it in your routine. Multi-day plans appear in the Weekly routine section below.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newWorkoutName}
              onChange={(event) => setNewWorkoutName(event.target.value)}
              placeholder="New empty workout name"
              className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={creatingWorkout || !newWorkoutName.trim()}
              onClick={() => void handleCreateWorkout()}
            >
              <Plus className="mr-1 inline h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveFromDayName}
              onChange={(event) => setSaveFromDayName(event.target.value)}
              placeholder="Save today's exercises as…"
              className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={creatingWorkout || !saveFromDayName.trim()}
              onClick={() => void handleSaveFromDay()}
            >
              Save day
            </Button>
          </div>
          {myWorkouts.length > 0 && (
            <ul className="space-y-2">
              {myWorkouts.map((workout) => {
                const expanded = editingWorkoutId === workout.id;
                return (
                  <li
                    key={workout.id}
                    className={`rounded-2xl border transition ${
                      expanded
                        ? 'relative z-20 overflow-visible border-brand-green/40 bg-app-surface shadow-sm'
                        : 'overflow-hidden border-app-border'
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setEditingWorkoutId((current) => (current === workout.id ? null : workout.id))
                      }
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-app-muted/50 ${
                        expanded ? 'rounded-t-2xl' : 'rounded-2xl'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-app-text">{workout.name}</span>
                        <span className="block text-xs text-app-text-muted">
                          {workout.exerciseCount
                            ? `${workout.exerciseCount} exercise${workout.exerciseCount === 1 ? '' : 's'}`
                            : 'Empty — tap to add exercises'}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-app-text-muted transition ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expanded && (
                      <InlineWorkoutEditor
                        workoutId={workout.id}
                        clientId={clientId}
                        onClose={() => setEditingWorkoutId(null)}
                        onChanged={async () => {
                          await reloadWorkouts();
                          const templates = await api<ExercisePlanTemplateSummary[]>(endpoints.templates);
                          if (!templates.some((entry) => entry.id === workout.id)) {
                            setAssignments((current) =>
                              current.map((day) =>
                                day.templateId === workout.id ? { ...day, templateId: null } : day
                              )
                            );
                            setEditingWorkoutId(null);
                          }
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-app-text">Weekly routine</h3>
          <p className="text-sm text-app-text-muted">
            Choose an exercise plan, then assign each weekday a routine from that plan (or Rest). Your
            schedule repeats every week and fills in upcoming days automatically.
          </p>

          {loading ? (
            <p className="text-sm text-app-text-muted">Loading…</p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                  Exercise plan
                </span>
                <select
                  value={selectedPlanId ?? CUSTOM_PLAN_VALUE}
                  onChange={(event) => handlePlanChange(event.target.value)}
                  className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                >
                  <option value={CUSTOM_PLAN_VALUE}>Custom (my workouts)</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                      {plan.dayCount ? ` · ${plan.dayCount} routine${plan.dayCount === 1 ? '' : 's'}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-3">
                {assignments.map((day) => (
                  <div key={day.weekday} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-sm font-semibold text-app-text">
                      {WEEKDAY_LABELS[day.weekday]}
                    </span>
                    <select
                      value={day.templateId ?? REST_VALUE}
                      onChange={(event) => setDayTemplate(day.weekday, event.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                    >
                      <option value={REST_VALUE}>Rest</option>
                      {dayOptions.map((workout) => (
                        <option key={workout.id} value={workout.id}>
                          {workout.dayIndex != null ? `${workout.dayIndex}. ` : ''}
                          {workout.name}
                          {workout.exerciseCount ? ` (${workout.exerciseCount})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-sm text-app-text-muted">
                Your routine: <span className="font-medium text-app-text">{summary || 'All rest days'}</span>
              </p>
              {selectedPlanId && dayOptions.length === 0 && (
                <p className="text-sm text-amber-700">
                  This plan has no day routines yet. Re-import plans or pick Custom.
                </p>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Button type="button" disabled={saving || loading} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save routine'}
            </Button>
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {saved && !saving && (
              <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                <Check className="h-4 w-4" />
                Routine saved
              </span>
            )}
          </div>
          {saved && !saving && (
            <p className="text-xs text-app-text-muted">
              Upcoming days now follow this routine. Days you&apos;ve already edited or completed are kept as-is.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** Drawer wrapper preserved for the coach path — API-identical to before. */
export function RoutineEditor({
  open,
  selectedDate,
  clientId,
  onClose,
  onSaved,
  registerUndo
}: {
  open: boolean;
  selectedDate: string;
  clientId?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  registerUndo?: (message: string, snapshot: ExercisePlanUndoSnapshot | undefined) => void;
}) {
  return (
    <Drawer open={open} title="Weekly routine" onClose={onClose} panelClassName="max-w-lg">
      <RoutineEditorContent
        active={open}
        selectedDate={selectedDate}
        clientId={clientId}
        onSaved={onSaved}
        onCancel={onClose}
        registerUndo={registerUndo}
      />
    </Drawer>
  );
}
