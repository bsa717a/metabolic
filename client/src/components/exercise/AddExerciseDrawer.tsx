import { useEffect, useState } from 'react';
import type { ExerciseCatalogItem } from '../../types';
import { EXERCISE_BODY_PARTS, EXERCISE_CATEGORIES } from '../../types';
import { api } from '../../services/api';
import { coachDailyExercisesApi } from '../../utils/coachExerciseApi';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

const FIELD_CLASS = 'w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text';

type ExerciseLookupResult = {
  source: 'existing' | 'ai' | 'mixed';
  items: Array<
    | { source: 'existing'; exercise: ExerciseCatalogItem }
    | {
        source: 'ai';
        lookup: { id: string };
        estimate: {
          name: string;
          description: string;
          category: string | null;
          bodyPart: string | null;
          defaultSets: number | null;
          defaultReps: number | null;
          defaultDurationMinutes: number | null;
          confidence: number;
        };
      }
  >;
};

export function AddExerciseDrawer({
  open,
  date,
  coachClientId,
  onClose,
  onSaved
}: {
  open: boolean;
  date: string;
  coachClientId?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Drawer open={open} title="Add exercise" panelClassName="max-w-lg" onClose={onClose}>
      {open && (
        <AddExerciseDrawerContent
          date={date}
          coachClientId={coachClientId}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function AddExerciseDrawerContent({
  date,
  coachClientId,
  onClose,
  onSaved
}: {
  date: string;
  coachClientId?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExerciseCatalogItem | null>(null);
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newBodyPart, setNewBodyPart] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState<ExerciseLookupResult | null>(null);
  const [selectedAiLookupId, setSelectedAiLookupId] = useState<string>();
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogError, setCatalogError] = useState<string>();
  const [createError, setCreateError] = useState<string>();
  const [aiError, setAiError] = useState<string>();

  useEffect(() => {
    api<ExerciseCatalogItem[]>('/api/exercises').then(setCatalog).catch(() => setCatalog([]));
  }, []);

  function selectExercise(item: ExerciseCatalogItem) {
    setCatalogError(undefined);
    setSelected(item);
    setSets(toInput(item.defaultSets));
    setReps(toInput(item.defaultReps));
    setDurationMinutes(toInput(item.defaultDurationMinutes));
    setDescription(item.description ?? '');
    setCategory(item.category ?? '');
    setBodyPart(item.bodyPart ?? '');
  }

  const filtered = catalog.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function lookupWithAi() {
    const input = aiQuery.trim();
    if (input.length < 2) return;
    setAiLoading(true);
    setAiError(undefined);
    try {
      setAiResults(await api<ExerciseLookupResult>('/api/ai/exercise-lookup', { method: 'POST', body: JSON.stringify({ inputText: input }) }));
    } catch (err) {
      setAiResults(null);
      setAiError(err instanceof Error ? err.message : 'AI lookup failed');
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiSuggestion(item: Extract<ExerciseLookupResult['items'][number], { source: 'ai' }>) {
    setSelected(null);
    setSelectedAiLookupId(item.lookup.id);
    setNewName(item.estimate.name);
    setNewDescription(item.estimate.description);
    setNewCategory(item.estimate.category ?? '');
    setNewBodyPart(item.estimate.bodyPart ?? '');
  }

  function useExistingSuggestion(item: Extract<ExerciseLookupResult['items'][number], { source: 'existing' }>) {
    setSelectedAiLookupId(undefined);
    selectExercise(item.exercise);
  }

  const exercisesApi = coachClientId
    ? coachDailyExercisesApi(coachClientId, date)
    : `/api/daily-logs/${date}/exercises`;

  async function addFromCatalog() {
    if (!selected) return;
    setSaving(true);
    setCatalogError(undefined);
    try {
      await api(exercisesApi, {
        method: 'POST',
        body: JSON.stringify({
          exerciseId: selected.id,
          sets: sets === '' ? null : Number(sets),
          reps: reps === '' ? null : Number(reps),
          durationMinutes: durationMinutes === '' ? null : Number(durationMinutes),
          weight: weight === '' ? null : Number(weight),
          description: description.trim() || null,
          category: category.trim() || null,
          bodyPart: bodyPart.trim() || null
        })
      });
      await onSaved();
      onClose();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Could not add exercise');
    } finally {
      setSaving(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setCreateError(undefined);
    try {
      const created = await api<ExerciseCatalogItem>('/api/exercises', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category: newCategory.trim() || undefined,
          bodyPart: newBodyPart.trim() || undefined,
          description: newDescription.trim() || undefined
        })
      });
      await api(exercisesApi, {
        method: 'POST',
        body: JSON.stringify({ exerciseId: created.id })
      });
      setCatalog((items) => (items.some((item) => item.id === created.id) ? items : [...items, created].sort((a, b) => a.name.localeCompare(b.name))));
      await onSaved();
      onClose();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create exercise');
    } finally {
      setSaving(false);
    }
  }

  return (
      <div className="space-y-5">
        <input
          className={FIELD_CLASS}
          placeholder="Search library…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="max-h-[min(45vh,18rem)] space-y-2 overflow-y-auto">
          {filtered.map((item) => {
            const isSelected = selected?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    isSelected
                      ? 'border-app-text bg-app-muted text-app-text'
                      : 'border-app-border bg-app-surface text-app-text hover:bg-app-muted'
                  }`}
                  onClick={() => (isSelected ? setSelected(null) : selectExercise(item))}
                >
                  <span className="font-semibold">{item.name}</span>
                  {item.bodyPart && <span className="ml-2 text-app-text-muted">{item.bodyPart}</span>}
                  {item.category && <span className="ml-2 text-app-text-muted">{item.category}</span>}
                </button>
              </li>
            );
          })}
          {!filtered.length && <li className="px-3 py-2 text-sm text-app-text-muted">No matches</li>}
        </ul>

        {selected && (
          <div className="space-y-3 rounded-xl border border-app-border bg-app-muted/40 p-4">
            <p className="text-sm font-semibold text-app-text">{selected.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="font-medium text-app-text">Sets</span>
                <NumberInput
                  min={0}
                  className="exercise-metric-input"
                  value={sets}
                  onChange={setSets}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium text-app-text">Reps</span>
                <NumberInput
                  min={0}
                  className="exercise-metric-input"
                  value={reps}
                  onChange={setReps}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium text-app-text">Minutes</span>
                <NumberInput
                  min={0}
                  className="exercise-metric-input"
                  value={durationMinutes}
                  onChange={setDurationMinutes}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium text-app-text">Weight (lbs)</span>
                <NumberInput
                  min={0}
                  step="0.5"
                  className="exercise-metric-input"
                  value={weight}
                  onChange={setWeight}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-app-text">Body part</span>
              <select
                className={`mt-1 ${FIELD_CLASS}`}
                value={bodyPart}
                onChange={(event) => setBodyPart(event.target.value)}
              >
                <option value="">Select body part…</option>
                {EXERCISE_BODY_PARTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-app-text">Type</span>
              <select
                className={`mt-1 ${FIELD_CLASS}`}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Select type…</option>
                {EXERCISE_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-app-text">Description</span>
              <textarea
                className={`mt-1 h-20 ${FIELD_CLASS}`}
                placeholder="Notes, form cues, or instructions…"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {catalogError && <p className="text-sm text-red-600">{catalogError}</p>}
            <Button onClick={() => void addFromCatalog()} disabled={saving}>
              {saving ? 'Adding…' : 'Add to day'}
            </Button>
          </div>
        )}

        {!selected && (
        <div className="border-t border-app-border pt-4">
          <p className="text-sm font-semibold text-app-text">Or create new</p>
          <div className="mt-2 space-y-3">
            <div className="rounded-2xl border border-app-border bg-app-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">AI lookup</p>
              <input
                className={`mt-2 ${FIELD_CLASS}`}
                placeholder='e.g. "Bicep exercises"'
                value={aiQuery}
                onChange={(event) => setAiQuery(event.target.value)}
              />
              <Button type="button" className="mt-2" variant="secondary" disabled={aiLoading || aiQuery.trim().length < 2} onClick={() => void lookupWithAi()}>
                {aiLoading ? 'Searching…' : 'Search with AI'}
              </Button>
              {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
              {aiResults && aiResults.items.length > 0 && (
                <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {aiResults.items.map((item) =>
                    item.source === 'existing' ? (
                      <li key={item.exercise.id}>
                        <button
                          type="button"
                          className="w-full rounded-xl bg-app-surface px-3 py-2 text-left text-sm text-app-text ring-1 ring-app-border hover:bg-app-muted"
                          onClick={() => useExistingSuggestion(item)}
                        >
                          <span className="font-semibold">{item.exercise.name}</span>
                          <span className="ml-2 text-xs uppercase text-app-text-muted">In library</span>
                        </button>
                      </li>
                    ) : (
                      <li key={item.lookup.id}>
                        <button
                          type="button"
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm ring-1 ${
                            selectedAiLookupId === item.lookup.id
                              ? 'bg-app-text text-app-surface ring-app-text'
                              : 'bg-app-surface text-app-text ring-app-border hover:bg-app-muted'
                          }`}
                          onClick={() => applyAiSuggestion(item)}
                        >
                          <span className="font-semibold">{item.estimate.name}</span>
                          {item.estimate.bodyPart && (
                            <span className={`ml-2 text-xs uppercase ${selectedAiLookupId === item.lookup.id ? 'opacity-80' : 'text-app-text-muted'}`}>
                              {item.estimate.bodyPart}
                            </span>
                          )}
                          {item.estimate.category && (
                            <span className={`ml-2 text-xs uppercase ${selectedAiLookupId === item.lookup.id ? 'opacity-80' : 'text-app-text-muted'}`}>
                              {item.estimate.category}
                            </span>
                          )}
                          <p className={`mt-1 text-sm ${selectedAiLookupId === item.lookup.id ? 'opacity-80' : 'text-app-text-muted'}`}>
                            {item.estimate.description}
                          </p>
                        </button>
                      </li>
                    )
                  )}
                </ul>
              )}
              {aiResults && aiResults.items.length === 0 && (
                <p className="mt-3 text-sm text-app-text-muted">No exercises found. Try a different search.</p>
              )}
            </div>

            <input
              className={FIELD_CLASS}
              placeholder="Exercise name"
              value={newName}
              onChange={(event) => {
                setSelectedAiLookupId(undefined);
                setNewName(event.target.value);
              }}
            />
            <select
              className={FIELD_CLASS}
              value={newBodyPart}
              onChange={(event) => setNewBodyPart(event.target.value)}
            >
              <option value="">Body part (optional)</option>
              {EXERCISE_BODY_PARTS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className={FIELD_CLASS}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            >
              <option value="">Type (optional)</option>
              {EXERCISE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <textarea
              className={`h-24 ${FIELD_CLASS}`}
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
            />
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <Button type="button" onClick={() => void createAndAdd()} disabled={saving || !newName.trim()}>
              {saving ? 'Adding…' : 'Create and add to day'}
            </Button>
          </div>
        </div>
        )}
      </div>
  );
}
