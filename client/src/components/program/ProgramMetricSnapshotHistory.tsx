import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ProgramMetricSnapshot } from '../../types';
import { parseDateKey } from '../../services/api';
import { Card } from '../ui/Card';
import { EditSnapshotDrawer } from './EditSnapshotDrawer';

type Props = {
  programId: string;
  snapshots: ProgramMetricSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdated: (snapshot: ProgramMetricSnapshot) => void;
};

type SnapshotRow = {
  snapshot: ProgramMetricSnapshot;
  session: number;
  weight: number | null;
  bodyFatPercent: number | null;
  leanTissue: number | null;
  fatMass: number | null;
  scaleChange: string;
  percentChange: string;
};

function metricValue(snapshot: ProgramMetricSnapshot, metricType: string) {
  const value = snapshot.values.find((row) => row.metricType === metricType);
  return value != null ? Number(value.currentValue) : null;
}

function formatDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatNumber(value: number | null, decimals = 2, suffix = '') {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(decimals)}${suffix}`;
}

function formatDelta(current: number | null, previous: number | null, decimals = 2, suffix = '') {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return 'N/A';
  const delta = current - previous;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}${suffix}`;
}

function buildRows(snapshots: ProgramMetricSnapshot[]): SnapshotRow[] {
  const chronological = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  return chronological.map((snapshot, index) => {
    const previous = index > 0 ? chronological[index - 1] : null;
    const weight = metricValue(snapshot, 'WEIGHT');
    const bodyFatPercent = metricValue(snapshot, 'BODY_FAT');
    const prevWeight = previous ? metricValue(previous, 'WEIGHT') : null;
    const prevBodyFat = previous ? metricValue(previous, 'BODY_FAT') : null;

    return {
      snapshot,
      session: index + 1,
      weight,
      bodyFatPercent,
      leanTissue: metricValue(snapshot, 'LEAN_TISSUE_MASS'),
      fatMass: metricValue(snapshot, 'FAT_MASS'),
      scaleChange: formatDelta(weight, prevWeight),
      percentChange: formatDelta(bodyFatPercent, prevBodyFat, 2, '%')
    };
  });
}

const headerCellClass = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide';
const bodyCellClass = 'px-3 py-3 text-sm text-slate-700 dark:text-app-text';

export function ProgramMetricSnapshotHistory({ programId, snapshots, selectedId, onSelect, onUpdated }: Props) {
  const [editingSnapshot, setEditingSnapshot] = useState<ProgramMetricSnapshot | null>(null);
  const rows = useMemo(() => buildRows(snapshots).reverse(), [snapshots]);
  const editingRow = rows.find((row) => row.snapshot.id === editingSnapshot?.id);

  if (snapshots.length === 0) {
    return (
      <Card>
        <h2 className="mb-1 text-lg font-bold">Session Snapshots</h2>
        <p className="text-sm text-slate-500 dark:text-app-text-muted">Save a session snapshot to start tracking progress over time.</p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <h2 className="mb-1 text-lg font-bold">Session Snapshots</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-app-text-muted">Select a session to preview it in the chart, or edit with the pencil.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-app-border">
          <table className="min-w-full text-left">
            <thead className="bg-slate-800 text-white dark:bg-app-muted dark:text-app-text">
              <tr>
                <th className={headerCellClass}>Session</th>
                <th className={headerCellClass}>Date</th>
                <th className={headerCellClass}>Weight</th>
                <th className={headerCellClass}>Body Fat %</th>
                <th className={headerCellClass}>Lean Tissue</th>
                <th className={headerCellClass}>Body Fat</th>
                <th className={headerCellClass}>Scale Change</th>
                <th className={headerCellClass}>% Change</th>
                <th className={`${headerCellClass} w-12`} aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = selectedId === row.snapshot.id;
                return (
                  <tr
                    key={row.snapshot.id}
                    tabIndex={0}
                    onClick={() => onSelect(selected ? null : row.snapshot.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(selected ? null : row.snapshot.id);
                      }
                    }}
                    className={`cursor-pointer border-t border-slate-100 transition dark:border-app-border ${
                      selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-brand-green/10 dark:ring-brand-green/30' : 'hover:bg-slate-50 dark:hover:bg-app-muted'
                    }`}
                  >
                    <td className={`${bodyCellClass} font-semibold`}>{row.session}</td>
                    <td className={bodyCellClass}>{formatDate(row.snapshot.date)}</td>
                    <td className={bodyCellClass}>{formatNumber(row.weight)}</td>
                    <td className={bodyCellClass}>{formatNumber(row.bodyFatPercent, 2, '%')}</td>
                    <td className={bodyCellClass}>{formatNumber(row.leanTissue, 1)}</td>
                    <td className={bodyCellClass}>{formatNumber(row.fatMass, 1)}</td>
                    <td className={bodyCellClass}>{row.scaleChange}</td>
                    <td className={bodyCellClass}>{row.percentChange}</td>
                    <td className={`${bodyCellClass} text-right`}>
                      <button
                        type="button"
                        aria-label={`Edit session ${row.session}`}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-app-text-muted dark:hover:bg-app-muted dark:hover:text-app-text"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingSnapshot(row.snapshot);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <EditSnapshotDrawer
        open={Boolean(editingSnapshot)}
        programId={programId}
        snapshot={editingSnapshot ?? undefined}
        session={editingRow?.session}
        onClose={() => setEditingSnapshot(null)}
        onSaved={onUpdated}
      />
    </>
  );
}
