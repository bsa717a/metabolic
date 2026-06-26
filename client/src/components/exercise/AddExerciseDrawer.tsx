import { useEffect, useState } from 'react';
import type { ExerciseCatalogItem } from '../../types';
import { EXERCISE_BODY_PARTS, EXERCISE_CATEGORIES } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function toInput(value?: number | null) {
  return value == null ? '' : String(value);
}

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
  onClose,
  onSaved
}: {
  open: boolean;
  date: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Drawer open={open} title="Add exercise" onClose={onClose}>
      {open && <AddExerciseDrawerContent date={date} onClose={onClose} onSaved={onSaved} />}
    </Drawer>
  );
}

function AddExerciseDrawerContent({
  date,
  onClose,
  onSaved
}: {
  date: string;
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

  async function addFromCatalog() {
    if (!selected) return;
    setSaving(true);
    setCatalogError(undefined);
    try {
      await api(`/api/daily-logs/${date}/exercises`, {
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
      await api(`/api/daily-logs/${date}/exercises`, {
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
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Search library…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="max-h-[min(60vh,20rem)] space-y-2 overflow-y-auto">
          {filtered.map((item) => {
            const isSelected = selected?.id === item.id;
            return (
              <li
                key={item.id}
                className={`rounded-xl border ${
                  isSelected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    isSelected ? 'text-slate-900' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => selectExercise(item)}
                >
                  <span className="font-semibold">{item.name}</span>
                  {item.bodyPart && <span className="ml-2 text-slate-500">{item.bodyPart}</span>}
                  {item.category && <span className="ml-2 text-slate-400">{item.category}</span>}
                </button>
                {isSelected && (
                  <div className="space-y-3 border-t border-slate-200 px-3 pb-3 pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="font-medium text-slate-700">Sets</span>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                          value={sets}
                          onChange={(event) => setSets(event.target.value)}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="font-medium text-slate-700">Reps</span>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                          value={reps}
                          onChange={(event) => setReps(event.target.value)}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="font-medium text-slate-700">Minutes</span>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                          value={durationMinutes}
                          onChange={(event) => setDurationMinutes(event.target.value)}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="font-medium text-slate-700">Weight (lbs)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                          value={weight}
                          onChange={(event) => setWeight(event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Body part</span>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
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
                      <span className="font-medium text-slate-700">Type</span>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
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
                      <span className="font-medium text-slate-700">Description</span>
                      <textarea
                        className="mt-1 h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
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
              </li>
            );
          })}
          {!filtered.length && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
        </ul>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-700">Or create new</p>
          <div className="mt-2 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI lookup</p>
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
                          className="w-full rounded-xl bg-white px-3 py-2 text-left text-sm ring-1 ring-slate-200 hover:bg-slate-100"
                          onClick={() => useExistingSuggestion(item)}
                        >
                          <span className="font-semibold">{item.exercise.name}</span>
                          <span className="ml-2 text-xs uppercase text-slate-400">In library</span>
                        </button>
                      </li>
                    ) : (
                      <li key={item.lookup.id}>
                        <button
                          type="button"
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm ring-1 ${
                            selectedAiLookupId === item.lookup.id
                              ? 'bg-slate-950 text-white ring-slate-950'
                              : 'bg-white ring-slate-200 hover:bg-slate-100'
                          }`}
                          onClick={() => applyAiSuggestion(item)}
                        >
                          <span className="font-semibold">{item.estimate.name}</span>
                          {item.estimate.bodyPart && (
                            <span className={`ml-2 text-xs uppercase ${selectedAiLookupId === item.lookup.id ? 'opacity-80' : 'text-slate-400'}`}>
                              {item.estimate.bodyPart}
                            </span>
                          )}
                          {item.estimate.category && (
                            <span className={`ml-2 text-xs uppercase ${selectedAiLookupId === item.lookup.id ? 'opacity-80' : 'text-slate-400'}`}>
                              {item.estimate.category}
                            </span>
                          )}
                          <p className={`mt-1 text-sm ${selectedAiLookupId === item.lookup.id ? 'text-slate-200' : 'text-slate-500'}`}>
                            {item.estimate.description}
                          </p>
                        </button>
                      </li>
                    )
                  )}
                </ul>
              )}
              {aiResults && aiResults.items.length === 0 && (
                <p className="mt-3 text-sm text-slate-500">No exercises found. Try a different search.</p>
              )}
            </div>

            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Exercise name"
              value={newName}
              onChange={(event) => {
                setSelectedAiLookupId(undefined);
                setNewName(event.target.value);
              }}
            />
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
              className="h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
      </div>
  );
}
