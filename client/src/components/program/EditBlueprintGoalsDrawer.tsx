import { useState } from 'react';
import type { ProgramMetric } from '../../types';
import { api } from '../../services/api';
import { BLUEPRINT_JOURNEY_METRICS } from '../../utils/journeyDialUtils';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

type GoalDraft = {
  id: string;
  metricType: string;
  label: string;
  unit: string;
  currentValue: number;
  startValue: number;
  goalValue: string;
};

function toDraft(metrics: ProgramMetric[]): GoalDraft[] {
  const byType = new Map(metrics.map((metric) => [metric.metricType, metric]));

  return BLUEPRINT_JOURNEY_METRICS.flatMap((config) => {
    const metric = byType.get(config.type);
    if (!metric) return [];

    return [
      {
        id: metric.id,
        metricType: metric.metricType,
        label: config.label,
        unit: metric.unit,
        currentValue: Number(metric.currentValue),
        startValue: Number(metric.startValue),
        goalValue: String(Number(metric.goalValue))
      }
    ];
  });
}

function labelClassName() {
  return 'mb-1 block text-xs font-medium text-slate-500';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

export function EditBlueprintGoalsDrawer({
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
    <Drawer open={open} title="Edit goals" onClose={onClose} panelClassName="max-w-md">
      {open && (
        <EditBlueprintGoalsDrawerContent
          key={metrics.map((metric) => `${metric.id}:${metric.goalValue}`).join('|')}
          programId={programId}
          metrics={metrics}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditBlueprintGoalsDrawerContent({
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

  function updateGoal(id: string, goalValue: string) {
    setDraft((current) => current.map((metric) => (metric.id === id ? { ...metric, goalValue } : metric)));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = draft.map((metric) => {
        const goalValue = Number(metric.goalValue);
        if (!Number.isFinite(goalValue)) {
          throw new Error(`Enter a valid goal for ${metric.label}.`);
        }
        return {
          id: metric.id,
          startValue: metric.startValue,
          currentValue: metric.currentValue,
          goalValue
        };
      });

      await api(`/api/programs/${programId}/metrics`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save goals');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Set your target for each journey dial. Current values stay the same.</p>

      {draft.map((metric) => (
        <div key={metric.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">{metric.label}</h3>
            <p className="text-xs text-slate-500">
              Now: {metric.currentValue} {metric.unit}
            </p>
          </div>
          <label className="block">
            <span className={labelClassName()}>Goal</span>
            <div className="flex items-center gap-2">
              <NumberInput
                className={inputClassName()}
                step="0.01"
                value={metric.goalValue}
                onChange={(value) => updateGoal(metric.id, value)}
              />
              <span className="text-xs text-slate-500">{metric.unit}</span>
            </div>
          </label>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save goals'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
