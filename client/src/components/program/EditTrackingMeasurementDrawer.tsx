import { useState } from 'react';
import type { ProgramMetricSnapshot } from '../../types';
import { api, parseDateKey, todayKey } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import type { TrackingMetricType } from './snapshotTracking';

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-slate-600';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

function formatSessionDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function EditTrackingMeasurementDrawer({
  open,
  programId,
  metricType,
  label,
  unit,
  snapshot,
  initialValue,
  onClose,
  onSaved
}: {
  open: boolean;
  programId: string;
  metricType: TrackingMetricType;
  label: string;
  unit: string;
  snapshot?: ProgramMetricSnapshot;
  initialValue?: string;
  onClose: () => void;
  onSaved: (snapshot: ProgramMetricSnapshot) => void;
}) {
  return (
    <Drawer open={open} title={snapshot ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`} onClose={onClose}>
      {open && (
        <EditTrackingMeasurementDrawerContent
          key={`${snapshot?.id ?? 'new'}:${metricType}:${initialValue ?? ''}`}
          programId={programId}
          metricType={metricType}
          label={label}
          unit={unit}
          snapshot={snapshot}
          initialValue={initialValue}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditTrackingMeasurementDrawerContent({
  programId,
  metricType,
  label,
  unit,
  snapshot,
  initialValue,
  onClose,
  onSaved
}: {
  programId: string;
  metricType: TrackingMetricType;
  label: string;
  unit: string;
  snapshot?: ProgramMetricSnapshot;
  initialValue?: string;
  onClose: () => void;
  onSaved: (snapshot: ProgramMetricSnapshot) => void;
}) {
  const [date, setDate] = useState(snapshot?.date ?? todayKey());
  const [value, setValue] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Enter a valid ${label.toLowerCase()} value.`);
      }

      const updated = await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots/measurements`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          metricType,
          currentValue: parsed,
          unit
        })
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save measurement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {snapshot ? `Editing entry from ${formatSessionDate(snapshot.date)}` : `Log a new ${label.toLowerCase()} measurement.`}
      </p>

      <label className="block">
        <span className={labelClassName()}>Date</span>
        <input className={inputClassName()} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>

      <label className="block">
        <span className={labelClassName()}>{label}</span>
        <div className="flex items-center gap-2">
          <NumberInput
            className={inputClassName()}
            step="0.01"
            value={value}
            onChange={setValue}
          />
          <span className="text-sm text-slate-500">{unit}</span>
        </div>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save measurement'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
