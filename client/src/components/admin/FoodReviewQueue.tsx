import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { ReviewFood } from '../../types';
import { Card } from '../ui/Card';
import { ReviewFoodDrawer } from './ReviewFoodDrawer';

type SortKey = 'name' | 'prompt' | 'serving' | 'calories' | 'submittedBy' | 'submitted';
type SortDirection = 'asc' | 'desc';

function formatServing(food: ReviewFood) {
  return `${Number(food.servingSize)} ${food.servingUnit}`;
}

function formatMacros(food: ReviewFood) {
  return `${Number(food.protein)}P / ${Number(food.carbs)}C / ${Number(food.fat)}F`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function submitterLabel(food: ReviewFood) {
  if (!food.createdBy) return '';
  return `${food.createdBy.firstName} ${food.createdBy.lastName}`.trim() || food.createdBy.email;
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareNumbers(a: number, b: number, direction: SortDirection) {
  const result = a - b;
  return direction === 'asc' ? result : -result;
}

function compareDates(a: string, b: string, direction: SortDirection) {
  const result = new Date(a).getTime() - new Date(b).getTime();
  return direction === 'asc' ? result : -result;
}

function matchesSearch(food: ReviewFood, query: string) {
  const haystack = [
    food.name,
    food.brand ?? '',
    food.inputText ?? '',
    formatServing(food),
    String(food.calories),
    formatMacros(food),
    submitterLabel(food),
    food.createdBy?.email ?? '',
    formatDate(food.createdAt)
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

export function FoodReviewQueue() {
  const [foods, setFoods] = useState<ReviewFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('submitted');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const selectedFood = foods.find((food) => food.id === selectedFoodId);

  const visibleFoods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? foods.filter((food) => matchesSearch(food, query)) : foods;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(a.name, b.name, sortDirection);
      if (sortKey === 'prompt') return compareStrings(a.inputText ?? '', b.inputText ?? '', sortDirection);
      if (sortKey === 'serving') return compareStrings(formatServing(a), formatServing(b), sortDirection);
      if (sortKey === 'calories') return compareNumbers(Number(a.calories), Number(b.calories), sortDirection);
      if (sortKey === 'submittedBy') return compareStrings(submitterLabel(a), submitterLabel(b), sortDirection);
      return compareDates(a.createdAt, b.createdAt, sortDirection);
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

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<ReviewFood[]>('/api/admin/food-review');
      setFoods(rows);
      setSelectedFoodId((current) => (current && rows.some((food) => food.id === current) ? current : null));
    } catch (err) {
      setFoods([]);
      setSelectedFoodId(null);
      setError(err instanceof Error ? err.message : 'Unable to load review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadQueue());
  }, [loadQueue]);

  function handleSaved(updated: ReviewFood) {
    setFoods((current) => current.map((food) => (food.id === updated.id ? updated : food)));
  }

  function handleResolved(foodId: string) {
    setFoods((current) => current.filter((food) => food.id !== foodId));
    setSelectedFoodId(null);
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">AI Review Queue</h2>
            <p className="text-sm text-app-text-muted">Click a row to review, edit, approve, or reject AI-generated foods.</p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search review queue…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-app-border bg-app-surface px-3 text-sm text-app-text sm:flex-none sm:w-56"
              aria-label="Search review queue"
            />
          )}
          <span className="ml-auto shrink-0 text-sm text-app-text-muted">
            {searchQuery.trim() ? `${visibleFoods.length} of ${foods.length}` : `${foods.length} pending`}
          </span>
        </div>

        {loading && <p className="text-sm text-app-text-muted">Loading review queue...</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && foods.length === 0 && (
          <p className="py-6 text-center text-sm text-app-text-muted">No AI-generated foods are waiting for review.</p>
        )}

        {!loading && !error && foods.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
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
                    label="Original prompt"
                    sortKey="prompt"
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
                    label="Submitted by"
                    sortKey="submittedBy"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Submitted"
                    sortKey="submitted"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
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
                        <div className="truncate font-semibold">{food.name}</div>
                        {food.brand && <div className="truncate text-app-text-muted">{food.brand}</div>}
                      </td>
                      <td className="max-w-0 py-3 pr-4 text-app-text-muted">
                        <span className="line-clamp-2">{food.inputText ?? '—'}</span>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{formatServing(food)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">{Math.round(Number(food.calories))}</td>
                      <td className="py-3 pr-4 text-app-text-muted">{formatMacros(food)}</td>
                      <td className="max-w-0 py-3 pr-4 truncate text-app-text-muted">{submitterLabel(food) || '—'}</td>
                      <td className="py-3 whitespace-nowrap text-app-text-muted">{formatDate(food.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleFoods.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">No items match your search.</p>
            )}
          </div>
        )}
      </Card>

      <ReviewFoodDrawer
        open={Boolean(selectedFood)}
        food={selectedFood}
        onClose={() => setSelectedFoodId(null)}
        onApproved={() => selectedFood && handleResolved(selectedFood.id)}
        onSaved={handleSaved}
        onRejected={() => selectedFood && handleResolved(selectedFood.id)}
      />
    </>
  );
}
