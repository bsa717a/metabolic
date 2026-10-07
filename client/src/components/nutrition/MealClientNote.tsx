import { useId, useState } from 'react';
import type { Meal } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';

const MAX_NOTE_LENGTH = 2000;

export function MealClientNote({ meal, onChange }: { meal: Meal; onChange: () => void | Promise<void> }) {
  const fieldId = useId();
  const saved = meal.clientNote?.trim() ? meal.clientNote : '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor(initial: string) {
    setDraft(initial);
    setError(null);
    setEditing(true);
  }

  async function save(next: string) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/meals/${meal.id}/note`, {
        method: 'PUT',
        body: JSON.stringify({ note: next })
      });
      setEditing(false);
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    if (!saved) {
      return (
        <div className="mt-3 border-t border-app-border pt-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-medium text-brand-green transition hover:bg-app-muted sm:text-sm"
            onClick={() => openEditor('')}
          >
            Add note
          </button>
        </div>
      );
    }

    return (
      <div className="mt-3 border-t border-app-border pt-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Note</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-medium text-app-text transition hover:bg-app-muted sm:text-sm"
              onClick={() => openEditor(saved)}
            >
              Edit note
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-medium text-app-text-muted transition hover:bg-app-muted sm:text-sm"
              disabled={saving}
              onClick={() => void save('')}
            >
              Remove
            </button>
          </div>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-base text-app-text sm:text-sm">{saved}</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-app-border pt-3">
      <label htmlFor={fieldId} className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
        Note
      </label>
      <textarea
        id={fieldId}
        value={draft}
        maxLength={MAX_NOTE_LENGTH}
        rows={3}
        placeholder="Add a note for this meal"
        className="mt-1 w-full resize-y rounded-xl border border-app-border bg-app-bg px-3 py-2 text-base text-app-text sm:text-sm"
        onChange={(event) => setDraft(event.target.value)}
        disabled={saving}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={saving} onClick={() => void save(draft)}>
          {saving ? 'Saving…' : 'Save note'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={saving}
          onClick={() => {
            setDraft(saved);
            setError(null);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function MealClientNoteReadOnly({ note, position = 'end' }: { note: string; position?: 'start' | 'end' }) {
  const frame =
    position === 'start' ? 'mb-3 border-b border-app-border pb-3' : 'mt-3 border-t border-app-border pt-3';
  return (
    <div className={frame}>
      <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Client note</p>
      <p className="mt-1 whitespace-pre-wrap text-base text-app-text sm:text-sm">{note}</p>
    </div>
  );
}
