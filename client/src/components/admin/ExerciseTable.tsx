import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import type { AdminExercise } from '../../types';
import { formatDuration } from '../../utils/duration';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { EditExerciseDrawer } from './EditExerciseDrawer';

type SortKey = 'name' | 'category' | 'bodyPart' | 'gym' | 'video';
type SortDirection = 'asc' | 'desc';

function formatDefaults(exercise: AdminExercise) {
  const parts: string[] = [];
  if (exercise.defaultSets != null) parts.push(`${exercise.defaultSets} sets`);
  if (exercise.defaultReps != null) parts.push(`${exercise.defaultReps} reps`);
  if (exercise.defaultDurationSeconds != null) {
    const label = formatDuration(exercise.defaultDurationSeconds);
    if (label) parts.push(label);
  }
  if (exercise.defaultDistance != null) parts.push(`${exercise.defaultDistance} mi`);
  return parts.length ? parts.join(' · ') : '—';
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareBooleans(a: boolean, b: boolean, direction: SortDirection) {
  const result = Number(a) - Number(b);
  return direction === 'asc' ? result : -result;
}

function matchesSearch(exercise: AdminExercise, query: string) {
  const haystack = [
    exercise.name,
    exercise.description ?? '',
    exercise.category ?? '',
    exercise.bodyPart ?? '',
    formatDefaults(exercise),
    exercise.requiresGym ? 'gym yes' : '',
    exercise.howToVideoUrl ? 'video yes' : ''
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  className = ''
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeSortKey === sortKey;

  return (
    <th className={`py-3 pr-4 font-medium ${className}`.trim()}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition ${
          active ? 'text-app-text' : 'text-app-text-muted hover:text-app-text'
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className="text-xs">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export function ExerciseTable() {
  const [exercises, setExercises] = useState<AdminExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideGym, setHideGym] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId);

  const visibleExercises = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const searched = query ? exercises.filter((exercise) => matchesSearch(exercise, query)) : exercises;
    const filtered = hideGym ? searched.filter((exercise) => !exercise.requiresGym) : searched;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(a.name, b.name, sortDirection);
      if (sortKey === 'category') return compareStrings(a.category ?? '', b.category ?? '', sortDirection);
      if (sortKey === 'bodyPart') return compareStrings(a.bodyPart ?? '', b.bodyPart ?? '', sortDirection);
      if (sortKey === 'gym') return compareBooleans(Boolean(a.requiresGym), Boolean(b.requiresGym), sortDirection);
      return compareBooleans(Boolean(a.howToVideoUrl), Boolean(b.howToVideoUrl), sortDirection);
    });
  }, [exercises, hideGym, searchQuery, sortDirection, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection('asc');
  }

  const loadExercises = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<AdminExercise[]>('/api/admin/exercises');
      setExercises(rows);
      setSelectedExerciseId((current) =>
        current && rows.some((exercise) => exercise.id === current) ? current : null
      );
    } catch (err) {
      setExercises([]);
      setSelectedExerciseId(null);
      setError(err instanceof Error ? err.message : 'Unable to load exercises');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadExercises());
  }, [loadExercises]);

  function handleSaved(updated: AdminExercise) {
    setExercises((current) => {
      const index = current.findIndex((exercise) => exercise.id === updated.id);
      if (index < 0) {
        return [...current, updated].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      }
      return current.map((exercise) => (exercise.id === updated.id ? updated : exercise));
    });
  }

  function closeDrawer() {
    setCreating(false);
    setSelectedExerciseId(null);
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Exercise Database</h2>
            <p className="text-sm text-app-text-muted">Click a row to edit, or create a new exercise.</p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search exercises…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-app-border bg-app-surface px-3 text-sm text-app-text sm:flex-none sm:w-56"
              aria-label="Search exercises"
            />
          )}
          {!loading && !error && (
            <label className="flex items-center gap-1.5 text-xs text-app-text-muted">
              <input type="checkbox" checked={hideGym} onChange={(event) => setHideGym(event.target.checked)} />
              Hide gym exercises
            </label>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="text-sm text-app-text-muted">
              {searchQuery.trim() || hideGym
                ? `${visibleExercises.length} of ${exercises.length}`
                : `${exercises.length} total`}
            </span>
            {!loading && !error && (
              <Button type="button" onClick={() => { setSelectedExerciseId(null); setCreating(true); }}>
                <Plus className="mr-1 inline h-4 w-4" />
                New exercise
              </Button>
            )}
          </div>
        </div>

        {loading && <p className="text-sm text-app-text-muted">Loading exercises...</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-app-border text-app-text-muted">
                  <SortableHeader
                    label="Exercise"
                    sortKey="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Category"
                    sortKey="category"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Body part"
                    sortKey="bodyPart"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Gym"
                    sortKey="gym"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <th className="py-3 pr-4 font-medium">Defaults</th>
                  <SortableHeader
                    label="Video"
                    sortKey="video"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                </tr>
              </thead>
              <tbody>
                {visibleExercises.map((exercise) => {
                  const selected = selectedExerciseId === exercise.id;
                  return (
                    <tr
                      key={exercise.id}
                      tabIndex={0}
                      onClick={() => {
                        setCreating(false);
                        setSelectedExerciseId(exercise.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setCreating(false);
                          setSelectedExerciseId(exercise.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-app-border transition last:border-0 ${
                        selected ? 'bg-brand-green/10 ring-1 ring-inset ring-brand-green/40' : 'hover:bg-app-muted'
                      }`}
                    >
                      <td className="max-w-0 py-3 pr-4">
                        <div className="truncate font-semibold">{exercise.name}</div>
                        {exercise.description && (
                          <div className="line-clamp-2 text-app-text-muted">{exercise.description}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{exercise.category ?? '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{exercise.bodyPart ?? '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{exercise.requiresGym ? 'Yes' : '—'}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{formatDefaults(exercise)}</td>
                      <td className="py-3 text-app-text-muted">{exercise.howToVideoUrl ? 'Yes' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {exercises.length === 0 && <p className="py-6 text-center text-sm text-app-text-muted">No exercises found.</p>}
            {exercises.length > 0 && visibleExercises.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">
                {searchQuery.trim()
                  ? 'No exercises match your search.'
                  : 'No home-friendly exercises.'}
              </p>
            )}
          </div>
        )}
      </Card>

      <EditExerciseDrawer
        open={creating || Boolean(selectedExercise)}
        mode={creating ? 'create' : 'edit'}
        exercise={selectedExercise}
        onClose={closeDrawer}
        onSaved={handleSaved}
      />
    </>
  );
}
