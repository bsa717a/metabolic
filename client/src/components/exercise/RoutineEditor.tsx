import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { api } from '../../services/api';
import type {
  ExercisePlanSummary,
  ExercisePlanTemplate,
  ExercisePlanTemplateSummary,
  ExerciseRoutine,
  ExerciseRoutineDay,
  ExerciseRoutineDayItemOverride,
  ExerciseTemplateItem
} from '../../types';
import type { ExercisePlanUndoSnapshot } from '../../types/exercisePlanUndo';
import { formatPlanShort } from '../../utils/exerciseFormat';
import { exercisePlanApi } from '../../utils/exercisePlanApi';
import { WEEKDAY_LABELS, type WeekdayIndex } from '../../utils/weekdayPattern';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { Drawer } from '../ui/Drawer';
import { InlineWorkoutEditor } from './InlineWorkoutEditor';
import { RepSchemeSelect } from './RepSchemeSelect';
import { SpeedSchemeSelect } from './SpeedSchemeSelect';

const REST_VALUE = '';
const CUSTOM_PLAN_VALUE = '__custom__';
const DRAG_THRESHOLD_PX = 6;

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function exerciseItemSummary(item: ExerciseTemplateItem) {
  const label = formatPlanShort(item);
  return label === '—' ? null : label;
}

function mergeItemWithOverride(
  item: ExerciseTemplateItem,
  overrides: ExerciseRoutineDayItemOverride[]
): ExerciseTemplateItem {
  const override = overrides.find((entry) => entry.templateItemId === item.id);
  if (!override) return item;
  return {
    ...item,
    sets: override.sets !== undefined ? override.sets : item.sets,
    reps: override.reps !== undefined ? override.reps : item.reps,
    speed: override.speed !== undefined ? override.speed : item.speed,
    durationMinutes:
      override.durationMinutes !== undefined ? override.durationMinutes : item.durationMinutes,
    distance: override.distance !== undefined ? override.distance : item.distance,
    weight: override.weight !== undefined ? override.weight : item.weight
  };
}

function PrescriptionNumberChip({
  label,
  value,
  onChange,
  onCommit,
  ariaLabel,
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex flex-col items-center rounded-lg border border-app-border bg-app-muted/40 px-1.5 py-1">
      <NumberInput
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value}
        placeholder="—"
        disabled={disabled}
        onChange={onChange}
        onBlur={onCommit}
        className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums text-app-text outline-none disabled:opacity-50"
      />
      <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">{label}</span>
    </label>
  );
}

function EditableDayExerciseRow({
  index,
  item,
  disabled,
  onPatch
}: {
  index: number;
  item: ExerciseTemplateItem;
  disabled?: boolean;
  onPatch: (patch: {
    sets?: number | null;
    reps?: string | null;
    speed?: string | null;
    durationMinutes?: number | null;
    weight?: number | null;
  }) => void;
}) {
  const [sets, setSets] = useState(toInput(item.sets));
  const [reps, setReps] = useState<string | null>(item.reps ?? null);
  const [speed, setSpeed] = useState<string | null>(item.speed ?? null);
  const [minutes, setMinutes] = useState(toInput(item.durationMinutes));
  const [weight, setWeight] = useState(toInput(item.weight));

  useEffect(() => {
    setSets(toInput(item.sets));
    setReps(item.reps ?? null);
    setSpeed(item.speed ?? null);
    setMinutes(toInput(item.durationMinutes));
    setWeight(toInput(item.weight));
  }, [item.id, item.sets, item.reps, item.speed, item.durationMinutes, item.weight]);

  function commit(next: { reps?: string | null; speed?: string | null } = {}) {
    if (disabled) return;
    const nextSets = parseOptionalNumber(sets);
    const nextReps = next.reps !== undefined ? next.reps : reps;
    const nextSpeed = next.speed !== undefined ? next.speed : speed;
    const nextMinutes = parseOptionalNumber(minutes);
    const nextWeight = parseOptionalNumber(weight);
    if (
      nextSets === (item.sets ?? null) &&
      nextReps === (item.reps ?? null) &&
      nextSpeed === (item.speed ?? null) &&
      nextMinutes === (item.durationMinutes ?? null) &&
      nextWeight === (item.weight == null ? null : Number(item.weight))
    ) {
      return;
    }
    onPatch({
      sets: nextSets,
      reps: nextReps,
      speed: nextSpeed,
      durationMinutes: nextMinutes,
      weight: nextWeight
    });
  }

  return (
    <li className="rounded-xl border border-app-border bg-app-surface px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0 text-[10px] font-bold tabular-nums text-app-text-muted">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-[6rem] flex-1 truncate text-xs font-semibold text-app-text">
            {item.exercise.name}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <PrescriptionNumberChip
              label="sets"
              value={sets}
              onChange={setSets}
              onCommit={() => commit()}
              ariaLabel="Sets"
              disabled={disabled}
            />
            <span className="text-xs text-app-text-muted">×</span>
            <label className="inline-flex flex-col items-center rounded-lg border border-app-border bg-app-muted/40 px-1.5 py-1">
              <RepSchemeSelect
                value={reps}
                disabled={disabled}
                onChange={(next) => {
                  setReps(next);
                  commit({ reps: next });
                }}
                className="w-[5.5rem] bg-transparent text-center text-xs font-semibold text-app-text outline-none disabled:opacity-50"
              />
              <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">reps</span>
            </label>
            <label className="inline-flex flex-col items-center rounded-lg border border-app-border bg-app-muted/40 px-1.5 py-1">
              <SpeedSchemeSelect
                value={speed}
                disabled={disabled}
                onChange={(next) => {
                  setSpeed(next);
                  commit({ speed: next });
                }}
                className="w-14 bg-transparent text-center text-xs font-semibold text-app-text outline-none disabled:opacity-50"
              />
              <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">speed</span>
            </label>
            <PrescriptionNumberChip
              label="min"
              value={minutes}
              onChange={setMinutes}
              onCommit={() => commit()}
              ariaLabel="Minutes"
              disabled={disabled}
            />
            <PrescriptionNumberChip
              label="lb"
              value={weight}
              onChange={setWeight}
              onCommit={() => commit()}
              ariaLabel="Weight"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

function useRoutineExercisePreview(templateId: string | null, open: boolean, clientId?: string) {
  const endpoints = useMemo(() => exercisePlanApi(clientId), [clientId]);
  const [items, setItems] = useState<ExerciseTemplateItem[] | null>(null);
  const [loadedForId, setLoadedForId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setItems(null);
    setLoadedForId(null);
    setLoadError('');
    setLoading(false);
  }, [templateId]);

  useEffect(() => {
    if (!open || !templateId) return;
    if (loadedForId === templateId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api<ExercisePlanTemplate>(endpoints.template(templateId))
      .then((data) => {
        if (cancelled) return;
        setItems([...data.items].sort((a, b) => a.sortOrder - b.sortOrder));
        setLoadedForId(templateId);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load exercises');
          setItems(null);
          setLoadedForId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, templateId, loadedForId, endpoints]);

  return { items, loading, loadError };
}

function RoutineExercisePreview({
  items,
  loading,
  loadError
}: {
  items: ExerciseTemplateItem[] | null;
  loading: boolean;
  loadError: string;
}) {
  return (
    <div className="border-t border-app-border bg-app-muted/30 px-3 py-2">
      {loading && <p className="text-xs text-app-text-muted">Loading…</p>}
      {!loading && loadError && <p className="text-xs text-red-600">{loadError}</p>}
      {!loading && !loadError && items && items.length === 0 && (
        <p className="text-xs text-app-text-muted">No exercises yet</p>
      )}
      {!loading && !loadError && items && items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const detail = exerciseItemSummary(item);
            return (
              <li key={item.id} className="text-xs text-app-text">
                <span className="font-medium">{item.exercise.name}</span>
                {detail && <span className="text-app-text-muted"> · {detail}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Work-area routine chip: drag/tap to assign, chevron to preview exercises. */
function PaletteRoutineCard({
  workout,
  selected,
  clientId,
  onPointerDown
}: {
  workout: ExercisePlanTemplateSummary;
  selected: boolean;
  clientId?: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const { items, loading, loadError } = useRoutineExercisePreview(workout.id, open, clientId);

  return (
    <li
      className={`overflow-hidden rounded-xl border transition ${
        selected
          ? 'border-brand-green bg-app-surface shadow-sm ring-2 ring-brand-green/25'
          : 'border-app-border bg-app-surface'
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onPointerDown={onPointerDown}
          className="min-w-0 flex-1 touch-none px-3 py-2.5 text-left text-sm font-medium text-app-text transition hover:bg-app-muted/50"
        >
          {workoutOptionLabel(workout)}
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Hide exercises in ${workout.name}` : `Show exercises in ${workout.name}`}
          onClick={() => setOpen((current) => !current)}
          className="shrink-0 px-2.5 text-app-text-muted transition hover:bg-app-muted/50 hover:text-app-text"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && <RoutineExercisePreview items={items} loading={loading} loadError={loadError} />}
    </li>
  );
}

/** Weekday drop target; expandable when a routine is assigned. Prescriptions editable when assigned. */
function WeekdayAssignmentRow({
  weekday,
  templateId,
  savedTemplateId,
  itemOverrides,
  label,
  isDropTarget,
  awaitingAssign,
  clientId,
  onActivate,
  onPointerDown,
  onEnsureSaved,
  onOverrideSaved
}: {
  weekday: WeekdayIndex;
  templateId: string | null;
  savedTemplateId: string | null | undefined;
  itemOverrides: ExerciseRoutineDayItemOverride[];
  label: string;
  isDropTarget: boolean;
  awaitingAssign: boolean;
  clientId?: string;
  onActivate: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onEnsureSaved: () => Promise<void>;
  onOverrideSaved: (override: ExerciseRoutineDayItemOverride) => void;
}) {
  const endpoints = useMemo(() => exercisePlanApi(clientId), [clientId]);
  const [open, setOpen] = useState(false);
  const [patchError, setPatchError] = useState('');
  const hasRoutine = Boolean(templateId);
  const assignmentSaved = Boolean(templateId && savedTemplateId && templateId === savedTemplateId);
  const { items, loading, loadError } = useRoutineExercisePreview(
    hasRoutine ? templateId : null,
    open && hasRoutine,
    clientId
  );

  const mergedItems = useMemo(
    () => (items ?? []).map((item) => mergeItemWithOverride(item, itemOverrides)),
    [items, itemOverrides]
  );

  useEffect(() => {
    if (!hasRoutine) setOpen(false);
  }, [hasRoutine, templateId]);

  async function handlePatch(
    item: ExerciseTemplateItem,
    patch: {
      sets?: number | null;
      reps?: string | null;
      speed?: string | null;
      durationMinutes?: number | null;
      weight?: number | null;
    }
  ) {
    if (!templateId) return;
    setPatchError('');
    try {
      if (!assignmentSaved) await onEnsureSaved();
      const result = await api<{ override: ExerciseRoutineDayItemOverride }>(
        endpoints.routineDayItem(weekday, item.id),
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      onOverrideSaved(result.override);
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : 'Unable to update prescription');
    }
  }

  return (
    <div
      data-routine-weekday={weekday}
      className={`overflow-hidden rounded-xl border transition ${
        isDropTarget
          ? 'border-brand-green bg-brand-green/10 ring-2 ring-brand-green/30'
          : awaitingAssign
            ? 'border-app-border bg-app-surface hover:border-brand-green/50'
            : 'border-app-border bg-app-surface'
      }`}
    >
      <button
        type="button"
        aria-expanded={hasRoutine ? open : undefined}
        aria-label={
          awaitingAssign
            ? `Assign selected routine to ${WEEKDAY_LABELS[weekday]}`
            : hasRoutine
              ? open
                ? `Hide exercises for ${label}`
                : `Show exercises for ${label}`
              : `${WEEKDAY_LABELS[weekday]} · ${label}`
        }
        onPointerDown={onPointerDown}
        onClick={() => {
          if (awaitingAssign) {
            onActivate();
            return;
          }
          if (hasRoutine) setOpen((current) => !current);
        }}
        className={`flex w-full touch-none items-center gap-3 px-3 py-2.5 text-left transition hover:bg-app-muted/40 ${
          hasRoutine || awaitingAssign ? 'cursor-pointer' : 'cursor-grab'
        }`}
      >
        <span className="w-10 shrink-0 text-sm font-semibold text-app-text">
          {WEEKDAY_LABELS[weekday]}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            hasRoutine ? 'font-medium text-app-text' : 'text-app-text-muted'
          }`}
        >
          {label}
        </span>
        {hasRoutine && (
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-app-text-muted transition ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {hasRoutine && open && (
        <div className="border-t border-app-border bg-app-muted/30 px-3 py-2">
          {loading && <p className="text-xs text-app-text-muted">Loading…</p>}
          {!loading && loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {!loading && !loadError && mergedItems.length === 0 && (
            <p className="text-xs text-app-text-muted">No exercises yet</p>
          )}
          {!loading && !loadError && mergedItems.length > 0 && (
            <ul className="space-y-1.5">
              {mergedItems.map((item, index) => (
                <EditableDayExerciseRow
                  key={item.id}
                  index={index + 1}
                  item={item}
                  onPatch={(patch) => void handlePatch(item, patch)}
                />
              ))}
            </ul>
          )}
          {patchError && <p className="mt-2 text-xs text-red-600">{patchError}</p>}
        </div>
      )}
    </div>
  );
}

type DayAssignment = {
  weekday: WeekdayIndex;
  templateId: string | null;
};

function workoutOptionLabel(workout: ExercisePlanTemplateSummary) {
  const prefix = workout.dayIndex != null ? `${workout.dayIndex}. ` : '';
  const count = workout.exerciseCount ? ` (${workout.exerciseCount})` : '';
  return `${prefix}${workout.name}${count}`;
}

function assignmentLabel(templateId: string | null, workouts: ExercisePlanTemplateSummary[]) {
  if (!templateId) return 'Rest';
  const workout = workouts.find((entry) => entry.id === templateId);
  if (!workout) return 'Workout';
  return workoutOptionLabel(workout);
}

function paletteLabel(value: string, workouts: ExercisePlanTemplateSummary[]) {
  if (value === REST_VALUE) return 'Rest';
  return assignmentLabel(value, workouts);
}

function weekdayFromPoint(clientX: number, clientY: number): WeekdayIndex | null {
  const el = document.elementFromPoint(clientX, clientY);
  const target = el?.closest('[data-routine-weekday]') as HTMLElement | null;
  if (!target) return null;
  const raw = Number(target.dataset.routineWeekday);
  if (!Number.isInteger(raw) || raw < 0 || raw > 6) return null;
  return raw as WeekdayIndex;
}

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

/** Map plan routines (already dayIndex-sorted) onto Mon…Sun; leftover weekdays stay Rest. */
function assignmentsFromPlanDays(planDays: ExercisePlanTemplateSummary[]): DayAssignment[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday: weekday as WeekdayIndex,
    templateId: planDays[weekday]?.id ?? null
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
  const [savedRoutineDays, setSavedRoutineDays] = useState<ExerciseRoutineDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [newWorkoutName, setNewWorkoutName] = useState('');
  const [creatingWorkout, setCreatingWorkout] = useState(false);
  const [saveFromDayName, setSaveFromDayName] = useState('');
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workoutsSectionOpen, setWorkoutsSectionOpen] = useState(false);
  const [selectedPaletteValue, setSelectedPaletteValue] = useState<string | null>(null);
  const [pointerTracking, setPointerTracking] = useState(false);
  const [draggingValue, setDraggingValue] = useState<string | null>(null);
  const [dragOverWeekday, setDragOverWeekday] = useState<WeekdayIndex | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const dragSessionRef = useRef<{
    value: string;
    sourceWeekday: WeekdayIndex | null;
    startX: number;
    startY: number;
    dragging: boolean;
    pointerId: number;
  } | null>(null);

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

  function clearPaletteInteraction() {
    setSelectedPaletteValue(null);
    setPointerTracking(false);
    setDraggingValue(null);
    setDragOverWeekday(null);
    setDragPointer(null);
    dragSessionRef.current = null;
  }

  function assignToDay(weekday: WeekdayIndex, value: string) {
    setDayTemplate(weekday, value);
    clearPaletteInteraction();
  }

  function swapDayAssignments(from: WeekdayIndex, to: WeekdayIndex) {
    if (from === to) {
      clearPaletteInteraction();
      return;
    }
    setSaved(false);
    setAssignments((current) => {
      const fromId = current.find((day) => day.weekday === from)?.templateId ?? null;
      const toId = current.find((day) => day.weekday === to)?.templateId ?? null;
      return current.map((day) => {
        if (day.weekday === from) return { ...day, templateId: toId };
        if (day.weekday === to) return { ...day, templateId: fromId };
        return day;
      });
    });
    clearPaletteInteraction();
  }

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
        setSavedRoutineDays(routine?.days ?? []);
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
    clearPaletteInteraction();

    if (nextPlanId) {
      const planDays = workoutsForPlan(nextPlanId, plans, workouts);
      const nextAssignments = assignmentsFromPlanDays(planDays);
      const hasExisting = assignments.some((day) => day.templateId);
      if (
        hasExisting &&
        !window.confirm('Replace this week with the plan’s routines (Mon onward)? Remaining days stay Rest.')
      ) {
        return;
      }
      setSelectedPlanId(nextPlanId);
      setAssignments(nextAssignments);
      setSaved(false);
      return;
    }

    // Custom: keep my-workout assignments; clear anything not in Custom.
    const allowed = new Set(workoutsForPlan(null, plans, workouts).map((workout) => workout.id));
    const invalid = assignments.some((day) => day.templateId && !allowed.has(day.templateId));
    if (
      invalid &&
      !window.confirm('Switching to Custom clears weekday assignments that are not your workouts. Continue?')
    ) {
      return;
    }
    setSelectedPlanId(null);
    setSaved(false);
    if (invalid) {
      setAssignments((current) =>
        current.map((day) =>
          day.templateId && !allowed.has(day.templateId) ? { ...day, templateId: null } : day
        )
      );
    }
  }

  useEffect(() => {
    if (selectedPaletteValue == null && draggingValue == null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') clearPaletteInteraction();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPaletteValue, draggingValue]);

  useEffect(() => {
    if (!pointerTracking) return;

    function handlePointerMove(event: PointerEvent) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        session.dragging = true;
        setDraggingValue(session.value);
        setSelectedPaletteValue(null);
      }
      if (!session.dragging) return;

      setDragPointer({ x: event.clientX, y: event.clientY });
      setDragOverWeekday(weekdayFromPoint(event.clientX, event.clientY));
    }

    function finishDrag(event: PointerEvent) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;

      if (session.dragging) {
        const weekday = weekdayFromPoint(event.clientX, event.clientY);
        if (weekday != null) {
          if (session.sourceWeekday != null) {
            swapDayAssignments(session.sourceWeekday, weekday);
          } else {
            assignToDay(weekday, session.value);
          }
        } else {
          setPointerTracking(false);
          setDraggingValue(null);
          setDragOverWeekday(null);
          setDragPointer(null);
          dragSessionRef.current = null;
        }
      } else if (session.sourceWeekday == null) {
        setSelectedPaletteValue((current) => (current === session.value ? null : session.value));
        setPointerTracking(false);
        setDraggingValue(null);
        setDragOverWeekday(null);
        setDragPointer(null);
        dragSessionRef.current = null;
      } else {
        // Weekday tap (no drag): let the row's onClick expand / assign.
        setPointerTracking(false);
        setDraggingValue(null);
        setDragOverWeekday(null);
        setDragPointer(null);
        dragSessionRef.current = null;
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [pointerTracking]);

  function handlePalettePointerDown(value: string, event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSessionRef.current = {
      value,
      sourceWeekday: null,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      pointerId: event.pointerId
    };
    setPointerTracking(true);
  }

  function handleWeekdayPointerDown(
    weekday: WeekdayIndex,
    templateId: string | null,
    event: React.PointerEvent<HTMLButtonElement>
  ) {
    if (event.button !== 0) return;
    // Don't steal the click when a palette routine is waiting to be assigned.
    if (selectedPaletteValue != null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSessionRef.current = {
      value: templateId ?? REST_VALUE,
      sourceWeekday: weekday,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      pointerId: event.pointerId
    };
    setPointerTracking(true);
  }

  function handleDayActivate(weekday: WeekdayIndex) {
    if (dragSessionRef.current?.dragging) return;
    if (selectedPaletteValue == null) return;
    assignToDay(weekday, selectedPaletteValue);
  }

  async function persistAssignments(nextAssignments: DayAssignment[] = assignments) {
    const result = await api<{ routine: ExerciseRoutine; undoSnapshot?: ExercisePlanUndoSnapshot }>(
      endpoints.routine,
      {
        method: 'PUT',
        body: JSON.stringify({
          days: nextAssignments.map((day) => ({
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
    setSavedRoutineDays(result.routine.days);
    setSelectedPlanId(result.routine.exercisePlanId ?? null);
    setSaved(true);
    return result.routine;
  }

  function assignmentsDirty() {
    if (savedRoutineDays.length === 0 && assignments.some((day) => day.templateId)) return true;
    const savedByWeekday = new Map(savedRoutineDays.map((day) => [day.weekday, day.templateId ?? null]));
    return assignments.some(
      (day) => (savedByWeekday.get(day.weekday) ?? null) !== (day.templateId ?? null)
    );
  }

  async function ensureAssignmentsSaved() {
    if (!assignmentsDirty()) return;
    await persistAssignments();
    await onSaved();
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await persistAssignments();
      await onSaved();
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save routine');
    } finally {
      setSaving(false);
    }
  }

  function handleDayOverrideSaved(weekday: WeekdayIndex, override: ExerciseRoutineDayItemOverride) {
    setSavedRoutineDays((current) =>
      current.map((day) => {
        if (day.weekday !== weekday) return day;
        const without = day.itemOverrides.filter(
          (entry) => entry.templateItemId !== override.templateItemId
        );
        return { ...day, itemOverrides: [...without, override] };
      })
    );
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
        <div className="overflow-hidden rounded-2xl border border-app-border bg-app-muted/40">
          <button
            type="button"
            aria-expanded={workoutsSectionOpen}
            onClick={() => setWorkoutsSectionOpen((open) => !open)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-app-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-app-text">{workoutsLabel}</span>
              {!workoutsSectionOpen && (
                <span className="block text-xs text-app-text-muted">
                  {myWorkouts.length
                    ? `${myWorkouts.length} workout${myWorkouts.length === 1 ? '' : 's'}`
                    : 'No workouts yet'}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-app-text-muted transition ${
                workoutsSectionOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {workoutsSectionOpen && (
            <div className="space-y-3 border-t border-app-border px-4 pb-4 pt-3">
              <p className="text-xs text-app-text-muted">
                Workouts are reusable exercise lists. Add exercises on any day, then save that day as a
                workout to reuse it in your routine. Multi-day plans appear in the Weekly routine section
                below.
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
                            setEditingWorkoutId((current) =>
                              current === workout.id ? null : workout.id
                            )
                          }
                          className={`flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-app-muted/50 ${
                            expanded ? 'rounded-t-2xl' : 'rounded-2xl'
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-app-text">
                              {workout.name}
                            </span>
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
                              const templates = await api<ExercisePlanTemplateSummary[]>(
                                endpoints.templates
                              );
                              if (!templates.some((entry) => entry.id === workout.id)) {
                                setAssignments((current) =>
                                  current.map((day) =>
                                    day.templateId === workout.id
                                      ? { ...day, templateId: null }
                                      : day
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
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-app-text">Weekly routine</h3>
          <p className="text-sm text-app-text-muted">
            Choose an exercise plan to pre-fill the week (first routine → Mon, next → Tue, and so on).
            Drag days to swap them, or drag from the work area / Rest to replace a day. Your schedule
            repeats every week and fills in upcoming days automatically.
          </p>

          {loading ? (
            <p className="text-sm text-app-text-muted">Loading…</p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                  Exercise plan
                </span>
                <div className="relative w-full max-w-xs">
                  <select
                    value={selectedPlanId ?? CUSTOM_PLAN_VALUE}
                    onChange={(event) => handlePlanChange(event.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-app-border bg-app-surface px-3 pr-9 text-sm font-medium text-app-text"
                  >
                    <option value={CUSTOM_PLAN_VALUE}>Custom (my workouts)</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                        {plan.dayCount ? ` · ${plan.dayCount} routine${plan.dayCount === 1 ? '' : 's'}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-text-muted"
                  />
                </div>
              </label>

              <div className="flex flex-col-reverse gap-4 md:flex-row">
                <div className="min-w-0 flex-1 space-y-2">
                  {assignments.map((day) => {
                    const savedDay = savedRoutineDays.find((entry) => entry.weekday === day.weekday);
                    const overridesMatch = Boolean(
                      day.templateId && savedDay?.templateId && day.templateId === savedDay.templateId
                    );
                    return (
                      <WeekdayAssignmentRow
                        key={day.weekday}
                        weekday={day.weekday}
                        templateId={day.templateId}
                        savedTemplateId={savedDay?.templateId}
                        itemOverrides={overridesMatch ? (savedDay?.itemOverrides ?? []) : []}
                        label={assignmentLabel(day.templateId, workouts)}
                        isDropTarget={dragOverWeekday === day.weekday}
                        awaitingAssign={selectedPaletteValue != null && draggingValue == null}
                        clientId={clientId}
                        onActivate={() => handleDayActivate(day.weekday)}
                        onPointerDown={(event) =>
                          handleWeekdayPointerDown(day.weekday, day.templateId, event)
                        }
                        onEnsureSaved={ensureAssignmentsSaved}
                        onOverrideSaved={(override) => handleDayOverrideSaved(day.weekday, override)}
                      />
                    );
                  })}
                </div>

                <div className="flex w-full shrink-0 flex-col rounded-2xl border border-app-border bg-app-muted/40 p-3 md:w-72">
                  <span className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                    Routines
                  </span>
                  <p className="mt-1 text-xs text-app-text-muted">
                    {selectedPaletteValue != null
                      ? 'Tap a day to assign, or drag onto a day'
                      : 'Drag onto a day, or tap then tap a day. Chevron shows exercises.'}
                  </p>
                  <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                    <li>
                      <button
                        type="button"
                        onPointerDown={(event) => handlePalettePointerDown(REST_VALUE, event)}
                        className={`w-full touch-none rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                          selectedPaletteValue === REST_VALUE || draggingValue === REST_VALUE
                            ? 'border-brand-green bg-app-surface font-medium text-app-text shadow-sm ring-2 ring-brand-green/25'
                            : 'border-app-border bg-app-surface text-app-text hover:bg-app-muted/50'
                        }`}
                      >
                        Rest
                      </button>
                    </li>
                    {dayOptions.map((workout) => (
                      <PaletteRoutineCard
                        key={workout.id}
                        workout={workout}
                        selected={
                          selectedPaletteValue === workout.id || draggingValue === workout.id
                        }
                        clientId={clientId}
                        onPointerDown={(event) => handlePalettePointerDown(workout.id, event)}
                      />
                    ))}
                  </ul>
                  {selectedPlanId && dayOptions.length === 0 && (
                    <p className="mt-3 text-sm text-amber-700">
                      This plan has no day routines yet. Re-import plans or pick Custom.
                    </p>
                  )}
                </div>
              </div>

              <p className="text-sm text-app-text-muted">
                Your routine: <span className="font-medium text-app-text">{summary || 'All rest days'}</span>
              </p>
            </>
          )}
        </div>

        {draggingValue != null && dragPointer && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 rounded-xl border border-brand-green/40 bg-app-surface px-3 py-2 text-sm font-medium text-app-text shadow-lg"
            style={{
              left: dragPointer.x + 12,
              top: dragPointer.y + 12
            }}
          >
            {paletteLabel(draggingValue, dayOptions)}
          </div>
        )}

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
