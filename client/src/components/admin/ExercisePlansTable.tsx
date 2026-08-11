import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { ExercisePlanSummary } from '../../types';
import { EditExercisePlanDrawer } from './EditExercisePlanDrawer';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type SortKey = 'name' | 'days' | 'visibility';
type SortDirection = 'asc' | 'desc';

function badgeClass(visibility: ExercisePlanSummary['visibility']) {
  return visibility === 'GLOBAL' ? 'bg-blue-50 text-blue-700' : 'bg-app-muted text-app-text-muted';
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareNumbers(a: number, b: number, direction: SortDirection) {
  const result = a - b;
  return direction === 'asc' ? result : -result;
}

function matchesSearch(plan: ExercisePlanSummary, query: string) {
  const haystack = [plan.name, plan.description ?? '', String(plan.dayCount), plan.visibility]
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

export function ExercisePlansTable({ initialPlanId }: { initialPlanId?: string }) {
  const navigate = useNavigate();
  const { id: routePlanId } = useParams<{ id?: string }>();
  const isPlanEditorRoute = Boolean(routePlanId ?? initialPlanId);
  const [plans, setPlans] = useState<ExercisePlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId ?? null);

  useEffect(() => {
    const activeId = routePlanId ?? initialPlanId;
    if (activeId) queueMicrotask(() => setSelectedPlanId(activeId));
  }, [initialPlanId, routePlanId]);

  function closeDrawer() {
    setSelectedPlanId(null);
    if (isPlanEditorRoute) navigate('/admin/exercise-plans');
  }

  function handlePlanSaved(updated: ExercisePlanSummary) {
    setPlans((current) => {
      const index = current.findIndex((plan) => plan.id === updated.id);
      if (index < 0) return current;
      const next = [...current];
      next[index] = updated;
      return next;
    });
  }

  function openPlan(id: string) {
    setSelectedPlanId(id);
    if (isPlanEditorRoute) {
      navigate(`/admin/exercise-plans/${id}`, { replace: true });
    }
  }

  const visiblePlans = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? plans.filter((plan) => matchesSearch(plan, query)) : plans;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(a.name, b.name, sortDirection);
      if (sortKey === 'days') return compareNumbers(a.dayCount, b.dayCount, sortDirection);
      return compareStrings(a.visibility, b.visibility, sortDirection);
    });
  }, [plans, searchQuery, sortDirection, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPlans(await api<ExercisePlanSummary[]>('/api/admin/exercise-plans'));
    } catch (err) {
      setPlans([]);
      setError(err instanceof Error ? err.message : 'Unable to load exercise plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function createPlan() {
    const name = window.prompt('Exercise plan name');
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const plan = await api<{ id: string }>('/api/admin/exercise-plans', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), visibility: 'GLOBAL' })
      });
      await load();
      openPlan(plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create exercise plan');
    } finally {
      setCreating(false);
    }
  }

  async function deletePlan(id: string, name: string) {
    if (!window.confirm(`Delete exercise plan "${name}"? Day workouts will be detached or removed.`)) return;
    try {
      await api(`/api/admin/exercise-plans/${id}`, { method: 'DELETE' });
      if (selectedPlanId === id) {
        setSelectedPlanId(null);
        if (isPlanEditorRoute) navigate('/admin/exercise-plans');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete exercise plan');
    }
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Exercise Plans</h2>
            <p className="text-sm text-app-text-muted">
              Multi-day routines like &ldquo;3 Day Split&rdquo;. Click a row to edit days.
            </p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search exercise plans…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-app-border bg-app-surface px-3 text-sm text-app-text sm:flex-none sm:w-56"
              aria-label="Search exercise plans"
            />
          )}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="text-sm text-app-text-muted">
              {searchQuery.trim() ? `${visiblePlans.length} of ${plans.length}` : `${plans.length} total`}
            </span>
            {!loading && !error && (
              <Button type="button" disabled={creating} onClick={() => void createPlan()}>
                <Plus className="mr-1 inline h-4 w-4" />
                New plan
              </Button>
            )}
          </div>
        </div>

        {loading && <p className="text-sm text-app-text-muted">Loading exercise plans…</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-app-border text-app-text-muted">
                  <SortableHeader
                    label="Name"
                    sortKey="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Days"
                    sortKey="days"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <SortableHeader
                    label="Visibility"
                    sortKey="visibility"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className="whitespace-nowrap"
                  />
                  <th className="py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlans.map((plan) => {
                  const selected = selectedPlanId === plan.id;
                  return (
                    <tr
                      key={plan.id}
                      tabIndex={0}
                      onClick={() => openPlan(plan.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openPlan(plan.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-app-border transition last:border-0 ${
                        selected ? 'bg-brand-green/10 ring-1 ring-inset ring-brand-green/40' : 'hover:bg-app-muted'
                      }`}
                    >
                      <td className="max-w-0 py-3 pr-4">
                        <div className="truncate font-semibold">{plan.name}</div>
                        {plan.description ? (
                          <div className="truncate text-app-text-muted">{plan.description}</div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">
                        {plan.dayCount} {plan.dayCount === 1 ? 'day' : 'days'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(plan.visibility)}`}
                        >
                          {plan.visibility}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          title="Delete"
                          className="grid h-9 w-9 place-items-center rounded-xl text-red-500 hover:bg-red-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deletePlan(plan.id, plan.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {plans.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">
                No exercise plans yet. Create one to get started.
              </p>
            )}
            {plans.length > 0 && visiblePlans.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">No plans match your search.</p>
            )}
          </div>
        )}
      </Card>

      <EditExercisePlanDrawer
        open={Boolean(selectedPlanId)}
        planId={selectedPlanId ?? undefined}
        onClose={closeDrawer}
        onSaved={handlePlanSaved}
        onReload={load}
      />
    </>
  );
}
