import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { NumberInput } from '../ui/NumberInput';

export type AdminCardSetSummary = {
  id: string;
  name: string;
  slotType: 'BREAKFAST' | 'SNACK' | 'LUNCH' | 'DINNER';
  referenceCalories: number;
  _count: { cards: number; templateMeals: number; userPicks: number };
};

export function MealCardSetsTable() {
  const [sets, setSets] = useState<AdminCardSetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', slotType: 'DINNER' as AdminCardSetSummary['slotType'], referenceCalories: 500 });

  const load = useCallback(() => {
    api<AdminCardSetSummary[]>('/api/admin/card-sets')
      .then(setSets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load card sets'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!draft.name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await api('/api/admin/card-sets', { method: 'POST', body: JSON.stringify({ ...draft, name: draft.name.trim() }) });
      setDraft({ name: '', slotType: 'DINNER', referenceCalories: 500 });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the card set');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Meal card sets</h2>
        <p className="text-sm text-app-text-muted">
          The card library is the menu clients build meals from. Portions are authored at each set's reference
          calories and scale to every client automatically.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-app-border text-left text-xs uppercase tracking-wide text-app-text-muted">
            <th className="py-2">Name</th>
            <th>Slot</th>
            <th>Reference kcal</th>
            <th>Cards</th>
            <th>Plan slots</th>
            <th>Users w/ picks</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sets.map((set) => (
            <tr key={set.id} className="border-b border-app-muted">
              <td className="py-2 font-semibold text-app-text">{set.name}</td>
              <td>{set.slotType}</td>
              <td className="tabular-nums">{Math.round(Number(set.referenceCalories))}</td>
              <td className="tabular-nums">{set._count.cards}</td>
              <td className="tabular-nums">{set._count.templateMeals}</td>
              <td className="tabular-nums">{set._count.userPicks}</td>
              <td className="text-right">
                <Link to={`/admin/meal-cards/${set.id}`} className="font-semibold text-brand-green hover:text-brand-deep">
                  Edit →
                </Link>
              </td>
            </tr>
          ))}
          {!sets.length && (
            <tr>
              <td colSpan={7} className="py-4 text-app-text-muted">
                No card sets yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex flex-wrap items-end gap-3 border-t border-app-border pt-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">New set name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="rounded-xl border border-app-border bg-app-surface px-3 py-2"
            placeholder="Stir-Fry Night"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">Slot</span>
          <select
            value={draft.slotType}
            onChange={(e) => setDraft({ ...draft, slotType: e.target.value as AdminCardSetSummary['slotType'] })}
            className="rounded-xl border border-app-border bg-app-surface px-3 py-2"
          >
            {(['BREAKFAST', 'SNACK', 'LUNCH', 'DINNER'] as const).map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">Reference kcal</span>
          <NumberInput
            value={draft.referenceCalories}
            onChange={(value) => setDraft({ ...draft, referenceCalories: value })}
            className="w-28 rounded-xl border border-app-border bg-app-surface px-3 py-2 tabular-nums"
          />
        </label>
        <Button type="button" onClick={() => void create()} disabled={creating || !draft.name.trim()}>
          {creating ? 'Creating…' : 'Create set'}
        </Button>
      </div>
    </Card>
  );
}
