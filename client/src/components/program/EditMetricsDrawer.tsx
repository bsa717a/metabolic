import { useState } from 'react';
import type { ProgramMetric } from '../../types';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

type MetricDraft = {
  id: string;
  metricType: string;
  unit: string;
  startValue: string;
  currentValue: string;
  goalValue: string;
};

function toDraft(metrics: ProgramMetric[]): MetricDraft[] {
  // Weight is the primary metric, so surface it first in the drawer.
  const ordered = [...metrics].sort((a, b) => {
    if (a.metricType === 'WEIGHT') return -1;
    if (b.metricType === 'WEIGHT') return 1;
    return 0;
  });
  return ordered.map((metric) => ({
    id: metric.id,
    metricType: metric.metricType,
    unit: metric.unit,
    startValue: String(Number(metric.startValue)),
    currentValue: String(Number(metric.currentValue)),
    goalValue: String(Number(metric.goalValue))
  }));
}

function labelClassName() {
  return 'mb-1 block text-xs font-medium text-slate-500';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

function formatMetricLabel(metricType: string) {
  return metricType.replaceAll('_', ' ');
}

export function EditMetricsDrawer({
  open,
  programId,
  metrics,
  onClose,
  onSaved
}: {
  open: boolean;
  programId: string;
  metrics: ProgramMetric[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Drawer open={open} title="Edit metrics" onClose={onClose}>
      {open && (
        <EditMetricsDrawerContent
          key={metrics.map((metric) => `${metric.id}:${metric.startValue}:${metric.currentValue}:${metric.goalValue}`).join('|')}
          programId={programId}
          metrics={metrics}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditMetricsDrawerContent({
  programId,
  metrics,
  onClose,
  onSaved
}: {
  programId: string;
  metrics: ProgramMetric[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() => toDraft(metrics));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateDraft(id: string, field: 'startValue' | 'currentValue' | 'goalValue', value: string) {
    setDraft((current) => current.map((metric) => (metric.id === id ? { ...metric, [field]: value } : metric)));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = draft.map((metric) => {
        const startValue = Number(metric.startValue);
        const currentValue = Number(metric.currentValue);
        const goalValue = Number(metric.goalValue);
        if (![startValue, currentValue, goalValue].every(Number.isFinite)) {
          throw new Error(`Enter valid numbers for ${formatMetricLabel(metric.metricType)}.`);
        }
        return { id: metric.id, startValue, currentValue, goalValue };
      });

      await api(`/api/programs/${programId}/metrics`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save metrics');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Update start, current, and goal values for each metric.</p>

      {draft.map((metric) => (
        <div key={metric.id} className="rounded-2xl border border-slate-200 p-4">
          <h3 className="mb-3 font-semibold">{formatMetricLabel(metric.metricType)}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={labelClassName()}>Start</span>
              <div className="flex items-center gap-2">
                <NumberInput
                  className={inputClassName()}
                  step="0.01"
                  value={metric.startValue}
                  onChange={(value) => updateDraft(metric.id, 'startValue', value)}
                />
                <span className="text-xs text-slate-500">{metric.unit}</span>
              </div>
            </label>
            <label className="block">
              <span className={labelClassName()}>Current</span>
              <div className="flex items-center gap-2">
                <NumberInput
                  className={inputClassName()}
                  step="0.01"
                  value={metric.currentValue}
                  onChange={(value) => updateDraft(metric.id, 'currentValue', value)}
                />
                <span className="text-xs text-slate-500">{metric.unit}</span>
              </div>
            </label>
            <label className="block">
              <span className={labelClassName()}>Goal</span>
              <div className="flex items-center gap-2">
                <NumberInput
                  className={inputClassName()}
                  step="0.01"
                  value={metric.goalValue}
                  onChange={(value) => updateDraft(metric.id, 'goalValue', value)}
                />
                <span className="text-xs text-slate-500">{metric.unit}</span>
              </div>
            </label>
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
