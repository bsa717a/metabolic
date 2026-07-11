import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { AdminFood } from '../../types';
import { Card } from '../ui/Card';
import { EditFoodDrawer } from './EditFoodDrawer';
import { foodEmoji } from '../../utils/foodEmoji';

type SortKey = 'name' | 'serving' | 'calories' | 'source';
type SortDirection = 'asc' | 'desc';

function formatServing(food: AdminFood) {
  return `${Number(food.servingSize)} ${food.servingUnit}`;
}

function formatMacros(food: AdminFood) {
  return `${Number(food.protein)}P / ${Number(food.carbs)}C / ${Number(food.fat)}F`;
}

function badgeClass(kind: 'verified' | 'ai' | 'global' | 'user') {
  if (kind === 'verified') return 'bg-emerald-50 text-emerald-700';
  if (kind === 'ai') return 'bg-violet-50 text-violet-700';
  if (kind === 'global') return 'bg-blue-50 text-blue-700';
  return 'bg-app-muted text-app-text-muted';
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareNumbers(a: number, b: number, direction: SortDirection) {
  const result = a - b;
  return direction === 'asc' ? result : -result;
}

function matchesSearch(food: AdminFood, query: string) {
  const haystack = [
    food.name,
    food.brand ?? '',
    formatServing(food),
    String(food.calories),
    formatMacros(food),
    food.source,
    food.visibility,
    food.verified ? 'verified' : '',
    food.aiGenerated ? 'ai' : ''
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

export function FoodTable() {
  const [foods, setFoods] = useState<AdminFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const selectedFood = foods.find((food) => food.id === selectedFoodId);

  const visibleFoods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? foods.filter((food) => matchesSearch(food, query)) : foods;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(a.name, b.name, sortDirection);
      if (sortKey === 'serving') return compareStrings(formatServing(a), formatServing(b), sortDirection);
      if (sortKey === 'calories') return compareNumbers(Number(a.calories), Number(b.calories), sortDirection);
      return compareStrings(a.source, b.source, sortDirection);
    });
  }, [foods, searchQuery, sortDirection, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection('asc');
  }

  const loadFoods = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<AdminFood[]>('/api/admin/foods');
      setFoods(rows);
      setSelectedFoodId((current) => (current && rows.some((food) => food.id === current) ? current : null));
    } catch (err) {
      setFoods([]);
      setSelectedFoodId(null);
      setError(err instanceof Error ? err.message : 'Unable to load foods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadFoods());
  }, [loadFoods]);

  function handleSaved(updated: AdminFood) {
    setFoods((current) => current.map((food) => (food.id === updated.id ? updated : food)));
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Food Database</h2>
            <p className="text-sm text-app-text-muted">Click a row to edit food details.</p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search foods…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-app-border bg-app-surface px-3 text-sm text-app-text sm:flex-none sm:w-56"
              aria-label="Search foods"
            />
          )}
          <span className="ml-auto shrink-0 text-sm text-app-text-muted">
            {searchQuery.trim() ? `${visibleFoods.length} of ${foods.length}` : `${foods.length} total`}
          </span>
        </div>

        {loading && <p className="text-sm text-app-text-muted">Loading foods...</p>}
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
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-app-border text-app-text-muted">
                  <SortableHeader
                    label="Food"
                    sortKey="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Serving"
                    sortKey="serving"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Calories"
                    sortKey="calories"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <th className="py-3 pr-4 font-medium">Macros</th>
                  <SortableHeader
                    label="Source"
                    sortKey="source"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <th className="py-3 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {visibleFoods.map((food) => {
                  const selected = selectedFoodId === food.id;
                  return (
                    <tr
                      key={food.id}
                      tabIndex={0}
                      onClick={() => setSelectedFoodId(food.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedFoodId(food.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-app-border transition last:border-0 ${
                        selected ? 'bg-brand-green/10 ring-1 ring-inset ring-brand-green/40' : 'hover:bg-app-muted'
                      }`}
                    >
                      <td className="max-w-0 py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0" aria-hidden>{foodEmoji(food.name)}</span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{food.name}</div>
                            {food.brand && <div className="truncate text-app-text-muted">{food.brand}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{formatServing(food)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{Math.round(Number(food.calories))}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{formatMacros(food)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{food.source}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(food.visibility === 'GLOBAL' ? 'global' : 'user')}`}>
                            {food.visibility}
                          </span>
                          {food.verified && (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass('verified')}`}>
                              Verified
                            </span>
                          )}
                          {food.aiGenerated && (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass('ai')}`}>
                              AI
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {foods.length === 0 && <p className="py-6 text-center text-sm text-app-text-muted">No foods found.</p>}
            {foods.length > 0 && visibleFoods.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">No foods match your search.</p>
            )}
          </div>
        )}
      </Card>

      <EditFoodDrawer
        open={Boolean(selectedFood)}
        food={selectedFood}
        onClose={() => setSelectedFoodId(null)}
        onSaved={handleSaved}
      />
    </>
  );
}
