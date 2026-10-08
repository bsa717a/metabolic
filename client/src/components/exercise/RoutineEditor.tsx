import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Search, X } from 'lucide-react';
import { api } from '../../services/api';
import type {
  ExerciseCatalogItem,
  ExercisePlanSummary,
  ExercisePlanTemplate,
  ExercisePlanTemplateSummary,
  ExerciseRoutine,
  ExerciseRoutineDay,
  ExerciseRoutineDayExtra,
  ExerciseRoutineDayItemOverride,
  ExerciseTemplateItem
} from '../../types';
import type { ExercisePlanUndoSnapshot } from '../../types/exercisePlanUndo';
import { exerciseRequiresGym, filterExerciseCatalog } from '../../utils/exerciseCatalogFilter';
import { type DurationUnit, inputToSeconds, secondsToInput } from '../../utils/duration';
import { formatPlanShort } from '../../utils/exerciseFormat';
import { exercisePlanApi } from '../../utils/exercisePlanApi';
import {
  assignmentsAfterPlanApply,
  shouldPersistAfterPlanApply,
  weekAssignmentsEqual,
  weekAssignmentsNeedSave
} from '../../utils/planApplyRace';
import { type RoutineDayExerciseView, visibleRoutineDayExercises } from '../../utils/routineDayEdits';
import { sharedField } from '../../utils/sharedPrescription';
import { WEEKDAY_LABELS, type WeekdayIndex } from '../../utils/weekdayPattern';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { Drawer } from '../ui/Drawer';
import { DurationChip } from './DurationField';
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

function DayTitlePrescription({
  items,
  disabled,
  onApply
}: {
  items: { sets?: number | null; reps?: string | null; speed?: string | null }[];
  disabled?: boolean;
  onApply: (patch: { sets?: number | null; reps?: string | null; speed?: string | null }) => void;
}) {
  const sharedSets = sharedField(items, (item) => item.sets);
  const sharedReps = sharedField(items, (item) => item.reps);
  const sharedSpeed = sharedField(items, (item) => item.speed);
  const committedSets = typeof sharedSets === 'number' ? sharedSets : null;
  const committedReps = typeof sharedReps === 'string' ? sharedReps : null;
  const committedSpeed = typeof sharedSpeed === 'string' ? sharedSpeed : null;

  const [sets, setSets] = useState(toInput(committedSets));
  const [reps, setReps] = useState<string | null>(committedReps);
  const [speed, setSpeed] = useState<string | null>(committedSpeed);

  useEffect(() => {
    setSets(toInput(committedSets));
    setReps(committedReps);
    setSpeed(committedSpeed);
  }, [committedSets, committedReps, committedSpeed]);

  function commit(next: { reps?: string | null; speed?: string | null } = {}) {
    if (disabled) return;
    const nextSets = parseOptionalNumber(sets);
    const nextReps = next.reps !== undefined ? next.reps : reps;
    const nextSpeed = next.speed !== undefined ? next.speed : speed;
    const patch: { sets?: number | null; reps?: string | null; speed?: string | null } = {};
    if (nextSets !== committedSets) patch.sets = nextSets;
    if (nextReps !== committedReps) patch.reps = nextReps;
    if (nextSpeed !== committedSpeed) patch.speed = nextSpeed;
    if (!Object.keys(patch).length) return;
    onApply(patch);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <PrescriptionNumberChip
        label="sets"
        value={sets}
        onChange={setSets}
        onCommit={() => commit()}
        ariaLabel="Sets for all exercises"
        disabled={disabled}
      />
      <span className="text-xs text-app-text-muted">×</span>
      <label className="inline-flex flex-col items-center rounded-lg border border-app-border bg-app-muted/40 px-1.5 py-1">
        <RepSchemeSelect
          value={reps}
          disabled={disabled}
          aria-label="Reps for all exercises"
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
          aria-label="Speed for all exercises"
          onChange={(next) => {
            setSpeed(next);
            commit({ speed: next });
          }}
          className="w-14 bg-transparent text-center text-xs font-semibold text-app-text outline-none disabled:opacity-50"
        />
        <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">speed</span>
      </label>
    </div>
  );
}

function EditableDayExerciseRow({
  index,
  item,
  disabled,
  onPatch,
  onRemove
}: {
  index: number;
  item: RoutineDayExerciseView;
  disabled?: boolean;
  onPatch: (patch: {
    sets?: number | null;
    reps?: string | null;
    speed?: string | null;
    durationSeconds?: number | null;
    weight?: number | null;
  }) => void;
  onRemove: () => void;
}) {
  const initialDuration = secondsToInput(item.durationSeconds);
  const [sets, setSets] = useState(toInput(item.sets));
  const [reps, setReps] = useState<string | null>(item.reps ?? null);
  const [speed, setSpeed] = useState<string | null>(item.speed ?? null);
  const [durationValue, setDurationValue] = useState(initialDuration.value);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(initialDuration.unit);
  const [weight, setWeight] = useState(toInput(item.weight));

  useEffect(() => {
    const next = secondsToInput(item.durationSeconds);
    setSets(toInput(item.sets));
    setReps(item.reps ?? null);
    setSpeed(item.speed ?? null);
    setDurationValue(next.value);
    setDurationUnit(next.unit);
    setWeight(toInput(item.weight));
  }, [item.key, item.sets, item.reps, item.speed, item.durationSeconds, item.weight]);

  function commit(
    next: {
      reps?: string | null;
      speed?: string | null;
      unit?: DurationUnit;
      durationValue?: string;
    } = {}
  ) {
    if (disabled) return;
    const nextSets = parseOptionalNumber(sets);
    const nextReps = next.reps !== undefined ? next.reps : reps;
    const nextSpeed = next.speed !== undefined ? next.speed : speed;
    const unit = next.unit ?? durationUnit;
    const value = next.durationValue ?? durationValue;
    const nextSeconds = inputToSeconds(value, unit);
    const nextWeight = parseOptionalNumber(weight);
    if (
      nextSets === (item.sets ?? null) &&
      nextReps === (item.reps ?? null) &&
      nextSpeed === (item.speed ?? null) &&
      nextSeconds === (item.durationSeconds ?? null) &&
      nextWeight === (item.weight == null ? null : Number(item.weight))
    ) {
      return;
    }
    onPatch({
      sets: nextSets,
      reps: nextReps,
      speed: nextSpeed,
      durationSeconds: nextSeconds,
      weight: nextWeight
    });
  }

  return (
    <li className="rounded-xl border border-app-border bg-app-surface px-2.5 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          title={`Remove ${item.name} from this day`}
          disabled={disabled}
          onClick={onRemove}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="w-4 shrink-0 text-[10px] font-bold tabular-nums text-app-text-muted">
          {index}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-[6rem] flex-1 truncate text-xs font-semibold text-app-text">
            {item.name}
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
            <DurationChip
              value={durationValue}
              unit={durationUnit}
              onChangeValue={setDurationValue}
              onChangeUnit={(next, converted) => {
                setDurationValue(converted);
                setDurationUnit(next);
                commit({ unit: next, durationValue: converted });
              }}
              onCommit={() => commit()}
              disabled={disabled}
              optional
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
function usualPrescriptionLabel(item: ExerciseCatalogItem) {
  if (item.defaultSets != null && item.defaultReps != null) {
    return `Adds as ${item.defaultSets}×${item.defaultReps}`;
  }
  if (item.defaultDurationSeconds != null && item.defaultDurationSeconds > 0) {
    return 'Adds with its usual duration';
  }
  return 'Adds with its usual sets and reps';
}

function WeekdayAssignmentRow({
  weekday,
  templateId,
  savedTemplateId,
  itemOverrides,
  excludedTemplateItemIds,
  extras,
  label,
  isDropTarget,
  awaitingAssign,
  clientId,
  onActivate,
  onPointerDown,
  onEnsureSaved,
  onDayUpdated,
  onApplied
}: {
  weekday: WeekdayIndex;
  templateId: string | null;
  savedTemplateId: string | null | undefined;
  itemOverrides: ExerciseRoutineDayItemOverride[];
  excludedTemplateItemIds: string[];
  extras: ExerciseRoutineDayExtra[];
  label: string;
  isDropTarget: boolean;
  awaitingAssign: boolean;
  clientId?: string;
  onActivate: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onEnsureSaved: () => Promise<void>;
  onDayUpdated: (day: ExerciseRoutineDay, undoSnapshot?: ExercisePlanUndoSnapshot) => void;
  onApplied?: () => void | Promise<void>;
}) {
  const endpoints = useMemo(() => exercisePlanApi(clientId), [clientId]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [patchError, setPatchError] = useState('');
  const [applyingAll, setApplyingAll] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [hideGym, setHideGym] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const editsMatch = (templateId ?? null) === (savedTemplateId ?? null);
  const { items, loading, loadError } = useRoutineExercisePreview(templateId, Boolean(templateId), clientId);
  const templateReady = !templateId || (!loading && items != null);
  const visibleItems = useMemo(
    () =>
      templateReady
        ? visibleRoutineDayExercises({
            templateItems: items,
            excludedTemplateItemIds: editsMatch ? excludedTemplateItemIds : [],
            itemOverrides: editsMatch ? itemOverrides : [],
            extras: editsMatch ? extras : []
          })
        : [],
    [templateReady, items, editsMatch, excludedTemplateItemIds, itemOverrides, extras]
  );
  const onDayExerciseIds = useMemo(
    () => new Set(visibleItems.map((item) => item.exerciseId)),
    [visibleItems]
  );
  const searchResults = useMemo(() => {
    const available = filterExerciseCatalog(catalog, { query, hideGym }).filter(
      (item) => !onDayExerciseIds.has(item.id)
    );
    if (!query.trim()) return available.slice(0, 8);
    return available.slice(0, 12);
  }, [catalog, hideGym, query, onDayExerciseIds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<ExerciseCatalogItem[]>('/api/exercises')
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function saveDayResult(result: { day: ExerciseRoutineDay; undoSnapshot?: ExercisePlanUndoSnapshot }) {
    onDayUpdated(result.day, result.undoSnapshot);
    await onApplied?.();
  }

  async function handlePatch(
    item: RoutineDayExerciseView,
    patch: {
      sets?: number | null;
      reps?: string | null;
      speed?: string | null;
      durationSeconds?: number | null;
      weight?: number | null;
    }
  ) {
    setPatchError('');
    try {
      await onEnsureSaved();
      if (item.source === 'template' && item.templateItemId) {
        const result = await api<{ day: ExerciseRoutineDay; undoSnapshot?: ExercisePlanUndoSnapshot }>(
          endpoints.routineDayItem(weekday, item.templateItemId),
          { method: 'PATCH', body: JSON.stringify(patch) }
        );
        await saveDayResult(result);
        return;
      }
      if (!item.extraId) return;
      const result = await api<{ day: ExerciseRoutineDay; undoSnapshot?: ExercisePlanUndoSnapshot }>(
        endpoints.routineDayExtra(weekday, item.extraId),
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      await saveDayResult(result);
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : 'Unable to update prescription');
    }
  }

  async function handleApplyAll(patch: {
    sets?: number | null;
    reps?: string | null;
    speed?: string | null;
  }) {
    if (!visibleItems.length) return;
    setPatchError('');
    setApplyingAll(true);
    try {
      await onEnsureSaved();
      const result = await api<{ day: ExerciseRoutineDay; undoSnapshot?: ExercisePlanUndoSnapshot }>(
        endpoints.routineDayItems(weekday),
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      await saveDayResult(result);
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : 'Unable to update prescription');
    } finally {
      setApplyingAll(false);
    }
  }

  async function handleRemove(item: RoutineDayExerciseView) {
    setPatchError('');
    setRemovingKey(item.key);
    try {
      await onEnsureSaved();
      const result = await api<{ day: ExerciseRoutineDay; undoSnapshot?: ExercisePlanUndoSnapshot }>(
        endpoints.removeRoutineDayExercise(weekday),
        {
          method: 'POST',
          body: JSON.stringify(
            item.source === 'template'
              ? { templateItemId: item.templateItemId }
              : { extraId: item.extraId }
          )
        }
      );
      await saveDayResult(result);
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : 'Unable to remove exercise');
    } finally {
      setRemovingKey(null);
    }
  }

  async function handleAdd(item: ExerciseCatalogItem) {
    setPatchError('');
    setAddingId(item.id);
    try {
      await onEnsureSaved();
      const result = await api<{ day: ExerciseRoutineDay; undoSnapshot?: ExercisePlanUndoSnapshot }>(
        endpoints.addRoutineDayExercise(weekday),
        { method: 'POST', body: JSON.stringify({ exerciseId: item.id }) }
      );
      setQuery('');
      setSearchOpen(false);
      await saveDayResult(result);
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : 'Unable to add exercise');
    } finally {
      setAddingId(null);
    }
  }

  const emphasized = label !== 'Rest';
  const busy = applyingAll || removingKey != null || addingId != null;

  return (
    <div
      data-routine-weekday={weekday}
      className={`rounded-xl border transition ${
        open ? 'relative z-20 overflow-visible' : 'overflow-hidden'
      } ${
        isDropTarget
          ? 'border-brand-green bg-brand-green/10 ring-2 ring-brand-green/30'
          : awaitingAssign
            ? 'border-app-border bg-app-surface hover:border-brand-green/50'
            : 'border-app-border bg-app-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-label={
            awaitingAssign
              ? `Assign selected routine to ${WEEKDAY_LABELS[weekday]}`
              : open
                ? `Hide exercises for ${WEEKDAY_LABELS[weekday]}`
                : `Show exercises for ${WEEKDAY_LABELS[weekday]}`
          }
          onPointerDown={onPointerDown}
          onClick={() => {
            if (awaitingAssign) {
              onActivate();
              return;
            }
            setOpen((current) => !current);
          }}
          className="flex min-w-0 flex-1 touch-none cursor-pointer items-center gap-3 text-left transition hover:bg-app-muted/40"
        >
          <span className="w-10 shrink-0 text-sm font-semibold text-app-text">
            {WEEKDAY_LABELS[weekday]}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              emphasized ? 'font-medium text-app-text' : 'text-app-text-muted'
            }`}
          >
            {label}
          </span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-app-text-muted transition ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {emphasized && !awaitingAssign && (
          <DayTitlePrescription
            items={visibleItems}
            disabled={busy || Boolean(loadError) || !templateReady || visibleItems.length === 0}
            onApply={(patch) => void handleApplyAll(patch)}
          />
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t border-app-border bg-app-muted/30 px-3 py-2">
          {loading && <p className="text-xs text-app-text-muted">Loading…</p>}
          {!loading && loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {templateReady && !loadError && visibleItems.length === 0 && (
            <p className="text-xs text-app-text-muted">Rest day. Search below to add an exercise.</p>
          )}
          {templateReady && visibleItems.length > 0 && (
            <ul className="space-y-1.5">
              {visibleItems.map((item, index) => (
                <EditableDayExerciseRow
                  key={item.key}
                  index={index + 1}
                  item={item}
                  disabled={busy}
                  onPatch={(patch) => void handlePatch(item, patch)}
                  onRemove={() => void handleRemove(item)}
                />
              ))}
            </ul>
          )}
          {templateReady && (
            <div className="relative pt-1">
              <label className="mb-2 flex items-center gap-1.5 text-xs text-app-text-muted">
                <input
                  type="checkbox"
                  checked={hideGym}
                  onChange={(event) => setHideGym(event.target.checked)}
                />
                Hide gym exercises
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-brand-green/40 bg-brand-green/5 px-3 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-brand-green" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setSearchOpen(false), 150);
                  }}
                  placeholder="Search to add an exercise"
                  aria-label={`Add an exercise on ${WEEKDAY_LABELS[weekday]}`}
                  className="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-app-text-muted"
                  autoComplete="off"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="text-app-text-muted hover:text-app-text"
                    onClick={() => {
                      setQuery('');
                      searchRef.current?.focus();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {searchOpen && (
                <ul className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-2xl border border-app-border bg-app-surface shadow-lg">
                  {searchResults.length === 0 ? (
                    <li className="px-3 py-3 text-sm text-app-text-muted">
                      {query.trim() ? 'No matching exercises.' : 'No exercises to add.'}
                    </li>
                  ) : (
                    searchResults.map((item) => {
                      const adding = addingId === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void handleAdd(item)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-brand-green/10 disabled:opacity-60"
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-green/15 text-brand-green">
                              {adding ? (
                                <span className="text-[10px] font-bold">…</span>
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-app-text">
                                {item.name}
                                {exerciseRequiresGym(item) && (
                                  <span className="ml-2 text-xs font-normal uppercase text-app-text-muted">
                                    Gym
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs text-app-text-muted">
                                {usualPrescriptionLabel(item)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>
          )}
          {patchError && <p className="text-xs text-red-600">{patchError}</p>}
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

function assignmentLabel(
  templateId: string | null,
  workouts: ExercisePlanTemplateSummary[],
  addedCount = 0
) {
  if (!templateId) {
    if (addedCount === 1) return '1 added exercise';
    if (addedCount > 1) return `${addedCount} added exercises`;
    return 'Rest';
  }
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

function routineSummary(
  days: DayAssignment[],
  workouts: ExercisePlanTemplateSummary[],
  savedDays: ExerciseRoutineDay[]
) {
  const workoutName = (id: string | null) =>
    id ? workouts.find((w) => w.id === id)?.name ?? 'Workout' : 'Rest';
  const counts = new Map<string, number>();
  for (const day of days) {
    const saved = savedDays.find((entry) => entry.weekday === day.weekday);
    const editsMatch = Boolean(saved) && (saved?.templateId ?? null) === (day.templateId ?? null);
    const added = editsMatch ? (saved?.extras?.length ?? 0) : 0;
    const key = day.templateId ?? (added > 0 ? `added:${day.weekday}` : REST_VALUE);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [key, count] of counts) {
    if (key === REST_VALUE) {
      parts.push(`${count} rest day${count > 1 ? 's' : ''}`);
    } else if (key.startsWith('added:')) {
      parts.push(`${count} added day${count > 1 ? 's' : ''}`);
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
  /** In-flight plan apply. Day edits wait for it so they read the settled week, not a stale plan. */
  const planApplyRef = useRef<Promise<void> | null>(null);
  const liveAssignmentsRef = useRef<DayAssignment[]>(defaultAssignments());
  const livePlanIdRef = useRef<string | null>(null);
  const liveSavedDaysRef = useRef<ExerciseRoutineDay[]>([]);
  const planApplySettlementRef = useRef<{
    succeeded: boolean;
    previous: DayAssignment[];
    previousPlanId: string | null;
  } | null>(null);
  const [savedRoutineDays, setSavedRoutineDays] = useState<ExerciseRoutineDay[]>([]);

  function rememberAssignments(next: DayAssignment[]) {
    liveAssignmentsRef.current = next;
    setAssignments(next);
  }

  function updateLiveAssignments(updater: (current: DayAssignment[]) => DayAssignment[]) {
    rememberAssignments(updater(liveAssignmentsRef.current));
  }

  function rememberPlanId(next: string | null) {
    livePlanIdRef.current = next;
    setSelectedPlanId(next);
  }

  function rememberSavedDays(next: ExerciseRoutineDay[]) {
    liveSavedDaysRef.current = next;
    setSavedRoutineDays(next);
  }
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

  const summary = useMemo(
    () => routineSummary(assignments, dayOptions, savedRoutineDays),
    [assignments, dayOptions, savedRoutineDays]
  );

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
    updateLiveAssignments((current) => {
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
        rememberAssignments(assignmentsFromRoutine(routine));
        rememberSavedDays(routine?.days ?? []);
        rememberPlanId(resolveSelectedPlanId(routine, templates));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load routine');
      })
      .finally(() => setLoading(false));
  }, [active, endpoints.routine, endpoints.templates, endpoints.plans]);

  function setDayTemplate(weekday: WeekdayIndex, value: string) {
    setSaved(false);
    updateLiveAssignments((current) =>
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
      const previousPlanId = livePlanIdRef.current;
      const previousAssignments = liveAssignmentsRef.current.map((day) => ({ ...day }));
      rememberPlanId(nextPlanId);
      rememberAssignments(nextAssignments);
      setSaved(false);
      setSaving(true);
      setError('');
      // Persist now with an explicit reset. A later Save must not keep sending
      // resetDayEdits, or weekday adds and removals made after this pick are wiped.
      const apply = (async () => {
        let succeeded = false;
        try {
          try {
            await persistAssignments(nextAssignments, {
              exercisePlanId: nextPlanId,
              resetDayEdits: true
            });
            succeeded = true;
          } catch (err) {
            // Settle before this promise resolves. A waiting add/remove then
            // reads this week, not the optimistic plan from its render.
            rememberAssignments(
              assignmentsAfterPlanApply({
                succeeded: false,
                sent: nextAssignments,
                local: liveAssignmentsRef.current,
                previous: previousAssignments,
                server: previousAssignments
              })
            );
            rememberPlanId(previousPlanId);
            setError(err instanceof Error ? err.message : 'Unable to apply plan');
          }
          if (succeeded) {
            try {
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unable to refresh after applying the plan');
            }
          }
        } finally {
          planApplySettlementRef.current = { succeeded, previous: previousAssignments, previousPlanId };
          setSaving(false);
        }
      })();
      planApplyRef.current = apply;
      void apply.finally(() => {
        if (planApplyRef.current === apply) planApplyRef.current = null;
      });
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
    rememberPlanId(null);
    setSaved(false);
    if (invalid) {
      updateLiveAssignments((current) =>
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

  async function persistAssignments(
    nextAssignments: DayAssignment[] = assignments,
    overrides?: { exercisePlanId?: string | null; resetDayEdits?: boolean }
  ) {
    const planId =
      overrides && 'exercisePlanId' in overrides ? (overrides.exercisePlanId ?? null) : livePlanIdRef.current;
    const resetDayEdits = overrides?.resetDayEdits === true;
    const result = await api<{ routine: ExerciseRoutine; undoSnapshot?: ExercisePlanUndoSnapshot }>(
      endpoints.routine,
      {
        method: 'PUT',
        body: JSON.stringify({
          days: nextAssignments.map((day) => ({
            weekday: day.weekday,
            templateId: day.templateId
          })),
          exercisePlanId: planId,
          applyForward: true,
          resetDayEdits
        })
      }
    );
    registerUndo?.('Weekly routine updated', result.undoSnapshot);
    const serverAssignments = assignmentsFromRoutine(result.routine);
    const kept = assignmentsAfterPlanApply({
      succeeded: true,
      sent: nextAssignments,
      local: liveAssignmentsRef.current,
      previous: nextAssignments,
      server: serverAssignments
    });
    const editedDuringSave = !weekAssignmentsEqual(nextAssignments, liveAssignmentsRef.current);
    if (!editedDuringSave) rememberAssignments(kept);
    rememberSavedDays(result.routine.days);
    rememberPlanId(result.routine.exercisePlanId ?? null);
    setSaved(!editedDuringSave);
    return result.routine;
  }

  async function ensureAssignmentsSaved() {
    if (planApplyRef.current) await planApplyRef.current;
    const settlement = planApplySettlementRef.current;
    planApplySettlementRef.current = null;
    const currentAssignments = liveAssignmentsRef.current;
    const savedDays = liveSavedDaysRef.current.map((day) => ({
      weekday: day.weekday,
      templateId: day.templateId ?? null
    }));
    const need = weekAssignmentsNeedSave(currentAssignments, savedDays);
    const decision = settlement
      ? shouldPersistAfterPlanApply({
          succeeded: settlement.succeeded,
          settled: currentAssignments,
          previous: settlement.previous,
          assignmentsNeedSave: need,
          routineExists: liveSavedDaysRef.current.length > 0
        })
      : { persist: need, assignments: 'settled' as const };
    if (!decision.persist) return;
    const toSave = decision.assignments === 'previous' ? settlement!.previous : currentAssignments;
    const planId =
      decision.assignments === 'previous' ? settlement!.previousPlanId : livePlanIdRef.current;
    await persistAssignments(toSave, { exercisePlanId: planId });
    await onSaved();
  }

  async function handleSave() {
    if (planApplyRef.current) await planApplyRef.current;
    planApplySettlementRef.current = null;
    setSaving(true);
    setError('');
    try {
      await persistAssignments(liveAssignmentsRef.current, {
        exercisePlanId: livePlanIdRef.current
      });
      await onSaved();
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save routine');
    } finally {
      setSaving(false);
    }
  }

  function handleDayUpdated(day: ExerciseRoutineDay, undoSnapshot?: ExercisePlanUndoSnapshot) {
    if (undoSnapshot) registerUndo?.('Weekly routine updated', undoSnapshot);
    rememberSavedDays(
      [...liveSavedDaysRef.current.filter((entry) => entry.weekday !== day.weekday), day].sort(
        (a, b) => a.weekday - b.weekday
      )
    );
    updateLiveAssignments((current) =>
      current.map((entry) =>
        entry.weekday === day.weekday ? { ...entry, templateId: day.templateId } : entry
      )
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
                                updateLiveAssignments((current) =>
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
            Open a day to take an exercise off that weekday, or search at the bottom to add one. Those
            changes stay on your routine. Drag days to swap them, or drag from the work area / Rest to
            replace a day. Set sets, reps, and speed on a day title to apply them to every exercise that
            day. Your schedule repeats every week and fills in upcoming days automatically.
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
                    disabled={saving || loading}
                    onChange={(event) => handlePlanChange(event.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-app-border bg-app-surface px-3 pr-9 text-sm font-medium text-app-text disabled:opacity-60"
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
                    const editsMatch = (day.templateId ?? null) === (savedDay?.templateId ?? null);
                    const addedCount = editsMatch ? (savedDay?.extras?.length ?? 0) : 0;
                    return (
                      <WeekdayAssignmentRow
                        key={day.weekday}
                        weekday={day.weekday}
                        templateId={day.templateId}
                        savedTemplateId={savedDay?.templateId}
                        itemOverrides={editsMatch ? (savedDay?.itemOverrides ?? []) : []}
                        excludedTemplateItemIds={
                          editsMatch ? (savedDay?.excludedTemplateItemIds ?? []) : []
                        }
                        extras={editsMatch ? (savedDay?.extras ?? []) : []}
                        label={assignmentLabel(day.templateId, workouts, addedCount)}
                        isDropTarget={dragOverWeekday === day.weekday}
                        awaitingAssign={selectedPaletteValue != null && draggingValue == null}
                        clientId={clientId}
                        onActivate={() => handleDayActivate(day.weekday)}
                        onPointerDown={(event) =>
                          handleWeekdayPointerDown(day.weekday, day.templateId, event)
                        }
                        onEnsureSaved={ensureAssignmentsSaved}
                        onDayUpdated={handleDayUpdated}
                        onApplied={onSaved}
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
