import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import type { ExercisePlanTemplateSummary } from '../../types';
import { CloneExerciseDayDialog } from './CloneExerciseDayDialog';
import { EditExerciseTemplateDrawer } from './EditExerciseTemplateDrawer';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type SortKey = 'name' | 'exercises' | 'visibility';
type SortDirection = 'asc' | 'desc';

function badgeClass(visibility: ExercisePlanTemplateSummary['visibility']) {
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

function matchesSearch(template: ExercisePlanTemplateSummary, query: string) {
  const haystack = [
    template.name,
    template.description ?? '',
    String(template.exerciseCount),
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
          active ? 'text-app-text' : 'text-app-text-muted hover:text-app-text'
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className="text-xs">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export function ExerciseTemplatesTable({ initialTemplateId }: { initialTemplateId?: string }) {
  const navigate = useNavigate();
  const { id: routeTemplateId } = useParams<{ id?: string }>();
  const isTemplateEditorRoute = Boolean(routeTemplateId ?? initialTemplateId);
  const [templates, setTemplates] = useState<ExercisePlanTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null);

  useEffect(() => {
    const activeId = routeTemplateId ?? initialTemplateId;
    if (activeId) queueMicrotask(() => setSelectedTemplateId(activeId));
  }, [initialTemplateId, routeTemplateId]);

  function closeDrawer() {
    setSelectedTemplateId(null);
    if (isTemplateEditorRoute) navigate('/admin/exercise-templates');
  }

  function handleTemplateSaved(updated: ExercisePlanTemplateSummary) {
    setTemplates((current) => {
      const index = current.findIndex((template) => template.id === updated.id);
      if (index < 0) return current;
      const next = [...current];
      next[index] = { ...next[index], ...updated };
      return next;
    });
  }

  function openTemplate(id: string) {
    setSelectedTemplateId(id);
    if (isTemplateEditorRoute) {
      navigate(`/admin/exercise-templates/${id}`, { replace: true });
    }
  }

  const visibleTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query ? templates.filter((template) => matchesSearch(template, query)) : templates;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return compareStrings(a.name, b.name, sortDirection);
      if (sortKey === 'exercises') return compareNumbers(a.exerciseCount, b.exerciseCount, sortDirection);
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
      setTemplates(await api<ExercisePlanTemplateSummary[]>('/api/admin/exercise-templates'));
    } catch (err) {
      setTemplates([]);
      setError(err instanceof Error ? err.message : 'Unable to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function createTemplate() {
    const name = window.prompt('Workout name');
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const template = await api<{ id: string }>('/api/admin/exercise-templates', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), visibility: 'GLOBAL' })
      });
      await load();
      openTemplate(template.id);
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
      const template = await api<{ id: string }>(`/api/admin/exercise-templates/${id}/clone`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() })
      });
      await load();
      openTemplate(template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clone plan');
    }
  }

  async function deleteTemplate(id: string, name: string) {
    if (!window.confirm(`Delete plan "${name}"?`)) return;
    try {
      await api(`/api/admin/exercise-templates/${id}`, { method: 'DELETE' });
      if (selectedTemplateId === id) {
        setSelectedTemplateId(null);
        if (isTemplateEditorRoute) navigate('/admin/exercise-templates');
      }
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
            <h2 className="text-lg font-bold">Workouts</h2>
            <p className="text-sm text-app-text-muted">Day templates and standalone workouts. Click a row to edit.</p>
          </div>
          {!loading && !error && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search workouts…"
              className="h-9 w-full min-w-[10rem] max-w-xs flex-1 rounded-xl border border-app-border bg-app-surface px-3 text-sm text-app-text sm:flex-none sm:w-56"
              aria-label="Search workouts"
            />
          )}
          {!loading && !error && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setCloneDialogOpen(true)}>
                Clone from user day
              </Button>
              <Button type="button" disabled={creating} onClick={() => void createTemplate()}>
                <Plus className="mr-1 inline h-4 w-4" />
                New workout
              </Button>
            </div>
          )}
          <span className="ml-auto shrink-0 text-sm text-app-text-muted">
            {searchQuery.trim() ? `${visibleTemplates.length} of ${templates.length}` : `${templates.length} total`}
          </span>
        </div>

        {loading && <p className="text-sm text-app-text-muted">Loading workouts…</p>}
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
                    label="Exercises"
                    sortKey="exercises"
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
                {visibleTemplates.map((template) => {
                  const selected = selectedTemplateId === template.id;
                  return (
                  <tr
                    key={template.id}
                    tabIndex={0}
                    onClick={() => openTemplate(template.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTemplate(template.id);
                      }
                    }}
                    className={`cursor-pointer border-b border-app-border transition last:border-0 ${
                      selected ? 'bg-brand-green/10 ring-1 ring-inset ring-brand-green/40' : 'hover:bg-app-muted'
                    }`}
                  >
                    <td className="max-w-0 py-3 pr-4">
                      <div className="truncate font-semibold">{template.name}</div>
                      {template.planName ? (
                        <div className="truncate text-app-text-muted">
                          Plan: {template.planName}
                          {template.dayIndex != null ? ` · day ${template.dayIndex}` : ''}
                        </div>
                      ) : template.description ? (
                        <div className="truncate text-app-text-muted">{template.description}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-app-text-muted">
                      {template.exerciseCount} exercises
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
                          className="grid h-9 w-9 place-items-center rounded-xl text-app-text-muted hover:bg-app-muted"
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
                  );
                })}
              </tbody>
            </table>
            {templates.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">No workouts yet. Create one to get started.</p>
            )}
            {templates.length > 0 && visibleTemplates.length === 0 && (
              <p className="py-6 text-center text-sm text-app-text-muted">No plans match your search.</p>
            )}
          </div>
        )}
      </Card>

      <CloneExerciseDayDialog
        open={cloneDialogOpen}
        onClose={() => setCloneDialogOpen(false)}
        onCreated={(id) => {
          void load().then(() => openTemplate(id));
        }}
      />

      <EditExerciseTemplateDrawer
        open={Boolean(selectedTemplateId)}
        templateId={selectedTemplateId ?? undefined}
        onClose={closeDrawer}
        onSaved={handleTemplateSaved}
      />
    </>
  );
}
