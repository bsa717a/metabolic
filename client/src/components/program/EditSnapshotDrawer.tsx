import { useState } from 'react';
import type { ProgramMetricSnapshot } from '../../types';
import { api, parseDateKey } from '../../services/api';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';

const BODY_COMP_METRICS = [
  { metricType: 'WEIGHT', label: 'Weight', unit: 'lbs' },
  { metricType: 'BODY_FAT', label: 'Body Fat %', unit: '%' },
  { metricType: 'LEAN_TISSUE_MASS', label: 'Lean Tissue', unit: 'lbs' },
  { metricType: 'FAT_MASS', label: 'Body Fat', unit: 'lbs' }
] as const;

const TRACKED_METRICS = [...BODY_COMP_METRICS] as const;

type SnapshotDraft = Record<(typeof TRACKED_METRICS)[number]['metricType'], string>;

function metricValue(snapshot: ProgramMetricSnapshot, metricType: string) {
  const value = snapshot.values.find((row) => row.metricType === metricType);
  return value != null ? String(Number(value.currentValue)) : '';
}

function unitFor(snapshot: ProgramMetricSnapshot, metricType: string, fallback: string) {
  return snapshot.values.find((row) => row.metricType === metricType)?.unit ?? fallback;
}

function toDraft(snapshot: ProgramMetricSnapshot): SnapshotDraft {
  return {
    WEIGHT: metricValue(snapshot, 'WEIGHT'),
    BODY_FAT: metricValue(snapshot, 'BODY_FAT'),
    LEAN_TISSUE_MASS: metricValue(snapshot, 'LEAN_TISSUE_MASS'),
    FAT_MASS: metricValue(snapshot, 'FAT_MASS')
  };
}

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-slate-600';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
}

function formatSessionDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function EditSnapshotDrawer({
  open,
  programId,
  snapshot,
  session,
  onClose,
  onSaved
}: {
  open: boolean;
  programId: string;
  snapshot?: ProgramMetricSnapshot;
  session?: number;
  onClose: () => void;
  onSaved: (snapshot: ProgramMetricSnapshot) => void;
}) {
  return (
    <Drawer open={open} title={snapshot ? `Edit session ${session ?? ''}` : 'Edit session'} onClose={onClose}>
      {open && snapshot && (
        <EditSnapshotDrawerContent
          key={snapshot.id}
          programId={programId}
          snapshot={snapshot}
          session={session}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditSnapshotDrawerContent({
  programId,
  snapshot,
  session,
  onClose,
  onSaved
}: {
  programId: string;
  snapshot: ProgramMetricSnapshot;
  session?: number;
  onClose: () => void;
  onSaved: (snapshot: ProgramMetricSnapshot) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(snapshot));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateDraft(metricType: keyof SnapshotDraft, value: string) {
    setDraft((current) => ({ ...current, [metricType]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const trackedPayload = TRACKED_METRICS.flatMap(({ metricType, unit }) => {
        const raw = draft[metricType].trim();
        if (!raw) return [];
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Enter a valid number for ${metricType.replaceAll('_', ' ').toLowerCase()}.`);
        }
        return [{
          metricType,
          currentValue: parsed,
          unit: unitFor(snapshot, metricType, unit)
        }];
      });

      const preserved = snapshot.values
        .filter((value) => !TRACKED_METRICS.some((metric) => metric.metricType === value.metricType))
        .map((value) => ({
          metricType: value.metricType,
          currentValue: Number(value.currentValue),
          unit: value.unit
        }));

      const updated = await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots/${snapshot.id}`, {
        method: 'PATCH',
        body: JSON.stringify([...trackedPayload, ...preserved])
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save session');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Session {session ?? '—'} · {formatSessionDate(snapshot.date)}
      </p>

      {BODY_COMP_METRICS.map(({ metricType, label, unit }) => (
        <label key={metricType} className="block">
          <span className={labelClassName()}>{label}</span>
          <div className="flex items-center gap-2">
            <NumberInput
              className={inputClassName()}
              step="0.01"
              value={draft[metricType]}
              onChange={(value) => updateDraft(metricType, value)}
            />
            <span className="text-sm text-slate-500">{unitFor(snapshot, metricType, unit)}</span>
          </div>
        </label>
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
