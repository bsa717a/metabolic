import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, Trash2, X } from 'lucide-react';
import type { ExerciseCatalogItem, ExercisePlanTemplate, ExerciseTemplateItem } from '../../types';
import { api } from '../../services/api';
import { exercisePlanApi } from '../../utils/exercisePlanApi';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { RepSchemeSelect } from './RepSchemeSelect';
import { SpeedSchemeSelect } from './SpeedSchemeSelect';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Inline workout editor that expands under a workout row.
 * Designed for speed: type to find → tap to add with defaults; edit sets/reps
 * on the row; tap ✕ to remove. No drawer, no multi-step add form.
 */
export function InlineWorkoutEditor({
  workoutId,
  clientId,
  onClose,
  onChanged
}: {
  workoutId: string;
  clientId?: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const endpoints = useMemo(() => exercisePlanApi(clientId), [clientId]);
  const searchRef = useRef<HTMLInputElement>(null);

  const [workout, setWorkout] = useState<ExercisePlanTemplate | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ExercisePlanTemplate>(endpoints.template(workoutId));
      setWorkout(data);
      setName(data.name);
    } catch (err) {
      setWorkout(null);
      setError(err instanceof Error ? err.message : 'Unable to load workout');
    } finally {
      setLoading(false);
    }
  }, [workoutId, endpoints]);

  useEffect(() => {
    void load();
    api<ExerciseCatalogItem[]>('/api/exercises').then(setCatalog).catch(() => setCatalog([]));
  }, [load]);

  const inWorkoutIds = useMemo(
    () => new Set(workout?.items.map((item) => item.exerciseId) ?? []),
    [workout]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = catalog.filter((item) => !inWorkoutIds.has(item.id));
    if (!q) return available.slice(0, 8);
    return available.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 12);
  }, [catalog, query, inWorkoutIds]);

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === workout?.name) return;
    setSavingName(true);
    setError('');
    try {
      const updated = await api<ExercisePlanTemplate>(endpoints.template(workoutId), {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed })
      });
      setWorkout(updated);
      setName(updated.name);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rename workout');
    } finally {
      setSavingName(false);
    }
  }

  async function handleQuickAdd(item: ExerciseCatalogItem) {
    setAddingId(item.id);
    setError('');
    try {
      // Always start at 3×10 — even for timed moves like plank (user can switch to minutes).
      const updated = await api<ExercisePlanTemplate>(endpoints.templateItems(workoutId), {
        method: 'POST',
        body: JSON.stringify({
          exerciseId: item.id,
          sets: 3,
          reps: '10',
          durationMinutes: null,
          weight: null
        })
      });
      setWorkout(updated);
      setQuery('');
      setSearchOpen(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add exercise');
    } finally {
      setAddingId(null);
    }
  }

  async function handlePatchItem(
    item: ExerciseTemplateItem,
    patch: {
      sets?: number | null;
      reps?: string | null;
      speed?: string | null;
      durationMinutes?: number | null;
      weight?: number | null;
    }
  ) {
    setError('');
    try {
      const updated = await api<ExercisePlanTemplate>(endpoints.templateItem(item.id), {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      setWorkout(updated);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update exercise');
      await load();
    }
  }

  async function handleRemoveItem(item: ExerciseTemplateItem) {
    setRemovingId(item.id);
    setError('');
    try {
      await api(endpoints.templateItem(item.id), { method: 'DELETE' });
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove exercise');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDeleteWorkout() {
    if (!window.confirm(`Delete "${workout?.name}"? Days using it in your routine will become rest days.`)) {
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await api(endpoints.template(workoutId), { method: 'DELETE' });
      await onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete workout');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="px-1 py-3 text-sm text-app-text-muted">Loading workout…</p>;
  }

  if (!workout) {
    return <p className="px-1 py-3 text-sm text-red-600">{error || 'Workout not found.'}</p>;
  }

  return (
    <div className="space-y-4 border-t border-app-border bg-app-surface/60 px-3 py-4 sm:px-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void handleSaveName()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Workout name"
          className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold text-app-text"
        />
        {savingName && <span className="text-xs text-app-text-muted">Saving…</span>}
      </div>

      {/* One-field add: search → tap result → done */}
      <div className="relative">
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
              // Delay so a result tap (mousedown → click) still registers.
              window.setTimeout(() => setSearchOpen(false), 150);
            }}
            placeholder="Type an exercise and tap to add…"
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
                {query.trim() ? 'No matching exercises.' : 'All catalog exercises are already in this workout.'}
              </li>
            ) : (
              searchResults.map((item) => {
                const busy = addingId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={busy || addingId != null}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void handleQuickAdd(item)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-brand-green/10 disabled:opacity-60"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-green/15 text-brand-green">
                        {busy ? (
                          <span className="text-[10px] font-bold">…</span>
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-app-text">{item.name}</span>
                        <span className="block text-xs text-app-text-muted">Adds as 3×10</span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {/* Exercise list — edit in place, remove with one tap */}
      <div className="space-y-2">
        {workout.items.length === 0 ? (
          <p className="rounded-xl bg-app-muted/50 px-3 py-4 text-center text-sm text-app-text-muted">
            Empty workout — search above and tap an exercise to add it.
          </p>
        ) : (
          <ul className="space-y-2">
            {workout.items.map((item, index) => (
              <ExerciseRow
                key={item.id}
                index={index + 1}
                item={item}
                busy={removingId === item.id}
                onRemove={() => void handleRemoveItem(item)}
                onPatch={(patch) => void handlePatchItem(item, patch)}
              />
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>
          <Check className="mr-1 inline h-4 w-4" />
          Done
        </Button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => void handleDeleteWorkout()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? 'Deleting…' : 'Delete workout'}
        </button>
      </div>
    </div>
  );
}

function ExerciseRow({
  index,
  item,
  busy,
  onRemove,
  onPatch
}: {
  index: number;
  item: ExerciseTemplateItem;
  busy: boolean;
  onRemove: () => void;
  onPatch: (patch: {
    sets?: number | null;
    reps?: string | null;
    speed?: string | null;
    durationMinutes?: number | null;
    weight?: number | null;
  }) => void;
}) {
  // Always expose sets/reps AND minutes (like the previous editors) — some exercises
  // (planks, carries, cardio) are timed instead of (or in addition to) rep-based.
  const [sets, setSets] = useState(toInput(item.sets));
  const [reps, setReps] = useState(item.reps ?? null);
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
    <li className="rounded-2xl border border-app-border bg-app-surface px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-app-text-muted">{index}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="min-w-[7rem] flex-1 truncate text-sm font-semibold text-app-text">
            {item.exercise.name}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <NumberChip label="sets" value={sets} onChange={setSets} onCommit={() => commit()} ariaLabel="Sets" optional />
            <span className="text-xs text-app-text-muted">×</span>
            <label className="inline-flex flex-col items-center rounded-lg border border-app-border bg-app-muted/40 px-1.5 py-1">
              <RepSchemeSelect
                value={reps}
                onChange={(next) => {
                  setReps(next);
                  commit({ reps: next });
                }}
                className="w-[5.5rem] bg-transparent text-center text-sm font-semibold text-app-text outline-none"
              />
              <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">reps</span>
            </label>
            <label className="inline-flex flex-col items-center rounded-lg border border-app-border bg-app-muted/40 px-1.5 py-1">
              <SpeedSchemeSelect
                value={speed}
                onChange={(next) => {
                  setSpeed(next);
                  commit({ speed: next });
                }}
                className="w-14 bg-transparent text-center text-sm font-semibold text-app-text outline-none"
              />
              <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">speed</span>
            </label>
            <NumberChip
              label="min"
              value={minutes}
              onChange={setMinutes}
              onCommit={() => commit()}
              ariaLabel="Minutes"
              optional
            />
            <NumberChip
              label="lb"
              value={weight}
              onChange={setWeight}
              onCommit={() => commit()}
              ariaLabel="Weight"
              optional
            />
          </div>
        </div>
        <button
          type="button"
          aria-label={`Remove ${item.exercise.name}`}
          disabled={busy}
          onClick={onRemove}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-app-text-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function NumberChip({
  label,
  value,
  onChange,
  onCommit,
  ariaLabel,
  optional
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  ariaLabel: string;
  optional?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded-lg bg-app-muted/70 px-2 py-1">
      <NumberInput
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value}
        placeholder={optional ? '—' : '0'}
        onChange={onChange}
        onBlur={onCommit}
        className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums text-app-text outline-none"
      />
      <span className="text-[10px] font-medium uppercase tracking-wide text-app-text-muted">{label}</span>
    </label>
  );
}
