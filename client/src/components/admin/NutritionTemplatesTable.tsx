import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { NutritionPlanTemplateSummary } from '../../types';
import { CloneDailyLogDialog } from './CloneDailyLogDialog';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type SortKey = 'name' | 'macros' | 'meals' | 'visibility';
type SortDirection = 'asc' | 'desc';

function formatMacros(template: NutritionPlanTemplateSummary) {
  return `${Math.round(template.calorieTarget)} kcal · ${Math.round(template.proteinTarget)}g P · ${Math.round(template.carbTarget)}g C · ${Math.round(template.fatTarget)}g F`;
}

function badgeClass(visibility: NutritionPlanTemplateSummary['visibility']) {
  return visibility === 'GLOBAL' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
}

function compareStrings(a: string, b: string, direction: SortDirection) {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

function compareNumbers(a: number, b: number, direction: SortDirection) {
  const result = a - b;
  return direction === 'asc' ? result : -result;
}

function matchesSearch(template: NutritionPlanTemplateSummary, query: string) {
  const haystack = [
    template.name,
    template.description ?? '',
    formatMacros(template),
    String(template.mealCount),
    String(template.itemCount),
    template.visibility
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
          active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className="text-xs">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export function NutritionTemplatesTable() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<NutritionPlanTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const visibleTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? templates.filter((template) => matchesSearch(template, query)) : templates;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(a.name, b.name, sortDirection);
      if (sortKey === 'macros') return compareNumbers(a.calorieTarget, b.calorieTarget, sortDirection);
      if (sortKey === 'meals') return compareNumbers(a.mealCount, b.mealCount, sortDirection);
      return compareStrings(a.visibility, b.visibility, sortDirection);
    });
  }, [templates, searchQuery, sortDirection, sortKey]);

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
      setTemplates(await api<NutritionPlanTemplateSummary[]>('/api/admin/nutrition-templates'));
    } catch (err) {
      setTemplates([]);
      setError(err instanceof Error ? err.message : 'Unable to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTemplate() {
    const name = window.prompt('Plan name');
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const template = await api<{ id: string }>('/api/admin/nutrition-templates', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), visibility: 'GLOBAL' })
      });
      navigate(`/admin/nutrition-templates/${template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create plan');
    } finally {
      setCreating(false);
    }
  }

  async function cloneTemplate(id: string, currentName: string) {
    const name = window.prompt('Clone name', `${currentName} (Copy)`);
    if (!name?.trim()) return;
    try {
      const template = await api<{ id: string }>(`/api/admin/nutrition-templates/${id}/clone`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      await load();
      navigate(`/admin/nutrition-templates/${template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clone plan');
    }
  }

  async function deleteTemplate(id: string, name: string) {
    if (!window.confirm(`Delete plan "${name}"?`)) return;
    try {
      await api(`/api/admin/nutrition-templates/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete plan');
    }
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Nutrition Plans</h2>
            <p className="text-sm text-slate-500">Click a row to edit a plan.</p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search plans…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-slate-200 px-3 text-sm sm:flex-none sm:w-56"
              aria-label="Search nutrition plans"
            />
          )}
          {!loading && !error && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setCloneDialogOpen(true)}>
                Clone from user day
              </Button>
              <Button type="button" disabled={creating} onClick={() => void createTemplate()}>
                <Plus className="mr-1 inline h-4 w-4" />
                New plan
              </Button>
            </div>
          )}
          <span className="ml-auto shrink-0 text-sm text-slate-500">
            {searchQuery.trim() ? `${visibleTemplates.length} of ${templates.length}` : `${templates.length} total`}
          </span>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading plans…</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[32%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <SortableHeader
                    label="Name"
                    sortKey="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Macros"
                    sortKey="macros"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Meals"
                    sortKey="meals"
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
                {visibleTemplates.map((template) => (
                  <tr
                    key={template.id}
                    tabIndex={0}
                    onClick={() => navigate(`/admin/nutrition-templates/${template.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/admin/nutrition-templates/${template.id}`);
                      }
                    }}
                    className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                  >
                    <td className="max-w-0 py-3 pr-4">
                      <div className="truncate font-semibold">{template.name}</div>
                      {template.description && (
                        <div className="truncate text-slate-500">{template.description}</div>
                      )}
                    </td>
                    <td className="max-w-0 py-3 pr-4 truncate text-slate-600">{formatMacros(template)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">
                      {template.mealCount} meals · {template.itemCount} items
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(template.visibility)}`}>
                        {template.visibility}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          title="Clone"
                          className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            void cloneTemplate(template.id, template.name);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          className="grid h-9 w-9 place-items-center rounded-xl text-red-500 hover:bg-red-50"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteTemplate(template.id, template.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {templates.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No plans yet. Create one to get started.</p>
            )}
            {templates.length > 0 && visibleTemplates.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No plans match your search.</p>
            )}
          </div>
        )}
      </Card>

      <CloneDailyLogDialog
        open={cloneDialogOpen}
        onClose={() => setCloneDialogOpen(false)}
        onCreated={(id) => navigate(`/admin/nutrition-templates/${id}`)}
      />
    </>
  );
}
