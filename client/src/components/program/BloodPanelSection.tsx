import { useState } from 'react';
import { ChevronDown, Pencil, Plus } from 'lucide-react';
import type { BloodPanelSummary } from '../../types';
import { parseDateKey } from '../../services/api';
import { Card } from '../ui/Card';
import { EditBloodPanelDrawer } from './EditBloodPanelDrawer';
import { BloodPanelMetricCard } from './bloodPanelDisplay';

function formatDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function BloodPanelSection({
  userId,
  bloodPanels,
  onBloodPanelUpdated
}: {
  userId: string;
  bloodPanels: BloodPanelSummary[];
  onBloodPanelUpdated: (panel: BloodPanelSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingBloodPanel, setEditingBloodPanel] = useState<BloodPanelSummary | null | undefined>(undefined);
  const latestBloodPanel = bloodPanels[0] ?? null;

  return (
    <>
      <Card>
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 dark:text-app-text-muted dark:hover:bg-app-muted"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            <ChevronDown size={18} className={`transition ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Blood panel</h2>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-green">Quarterly or as tested</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-app-text-muted">
                  Lab results for metabolic health markers with reference-range status.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-app-text-muted dark:hover:bg-app-muted dark:hover:text-app-text"
                aria-label="Add blood panel"
                title="Add blood panel"
                onClick={() => setEditingBloodPanel(null)}
              >
                <Plus size={16} />
              </button>
            </div>

            {latestBloodPanel ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {latestBloodPanel.metrics.map((metric) => (
                  <BloodPanelMetricCard key={metric.key} metric={metric} compact />
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500 dark:text-app-text-muted">No blood panels saved yet.</p>
            )}

            {expanded && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-app-border">
                {bloodPanels.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-app-text-muted">Add your first blood panel to start tracking lab results.</p>
                ) : (
                  bloodPanels.map((panel) => {
                    const metricCount = panel.metrics.filter((metric) => metric.value != null).length;
                    return (
                      <div
                        key={panel.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-app-muted"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 dark:text-app-text">{formatDate(panel.labDate)}</p>
                          <p className="text-sm text-slate-500 dark:text-app-text-muted">
                            {[panel.labProvider, `${metricCount} of 8 metrics`, panel.enteredBy ? `Added by ${panel.enteredBy.name}` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-app-text-muted dark:hover:bg-app-surface dark:hover:text-app-text"
                          aria-label="Edit blood panel"
                          onClick={() => setEditingBloodPanel(panel)}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {editingBloodPanel !== undefined && (
        <EditBloodPanelDrawer
          open
          userId={userId}
          panel={editingBloodPanel ?? undefined}
          onClose={() => setEditingBloodPanel(undefined)}
          onSaved={onBloodPanelUpdated}
        />
      )}
    </>
  );
}
