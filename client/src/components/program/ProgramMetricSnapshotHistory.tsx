import { useMemo, useState } from 'react';
import { Pencil, StickyNote } from 'lucide-react';
import type { ProgramMetricSnapshot } from '../../types';
import {
  buildSnapshotRows,
  formatSnapshotDate,
  formatSnapshotMetric
} from '../../utils/snapshotHistoryUtils';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';
import { EditSnapshotDrawer } from './EditSnapshotDrawer';

type Props = {
  programId: string;
  snapshots: ProgramMetricSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdated: (snapshot: ProgramMetricSnapshot) => void;
  compact?: boolean;
  embedded?: boolean;
};

const headerCellClass = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide';
const bodyCellClass = 'px-3 py-3 text-sm text-slate-700 dark:text-app-text';
const compactHeaderCellClass = 'px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide';
const compactBodyCellClass = 'px-2 py-2 text-xs text-slate-700 dark:text-app-text';

export function ProgramMetricSnapshotHistory({
  programId,
  snapshots,
  selectedId,
  onSelect,
  onUpdated,
  compact = false,
  embedded = false
}: Props) {
  const [editingSnapshot, setEditingSnapshot] = useState<ProgramMetricSnapshot | null>(null);
  const [viewingNotes, setViewingNotes] = useState<{ session: number; date: string; notes: string } | null>(null);
  const rows = useMemo(() => buildSnapshotRows(snapshots).reverse(), [snapshots]);
  const editingRow = rows.find((row) => row.snapshot.id === editingSnapshot?.id);
  const headerClass = compact ? compactHeaderCellClass : headerCellClass;
  const cellClass = compact ? compactBodyCellClass : bodyCellClass;
  const pencilSize = compact ? 14 : 16;

  if (snapshots.length === 0) {
    if (embedded) {
      return (
        <p className="text-sm text-slate-500 dark:text-app-text-muted">
          Save a session snapshot to start tracking progress over time.
        </p>
      );
    }

    return (
      <Card>
        <h2 className="mb-1 text-lg font-bold">Session Snapshots</h2>
        <p className="text-sm text-slate-500 dark:text-app-text-muted">Save a session snapshot to start tracking progress over time.</p>
      </Card>
    );
  }

  const table = (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-app-border">
      <table className="min-w-full text-left">
        <thead className="bg-slate-800 text-white dark:bg-app-muted dark:text-app-text">
          <tr>
            <th className={headerClass}>Session</th>
            <th className={headerClass}>Date</th>
            <th className={headerClass}>Weight</th>
            <th className={headerClass}>Body Fat %</th>
            <th className={headerClass}>Lean Tissue</th>
            <th className={headerClass}>Body Fat</th>
            <th className={headerClass}>Scale Change</th>
            <th className={headerClass}>% Change</th>
            <th className={`${headerClass} w-12`} aria-label="Session notes" />
            <th className={`${headerClass} w-12`} aria-label="Edit" />
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
                <td className={`${cellClass} font-semibold`}>{row.session}</td>
                <td className={cellClass}>{formatSnapshotDate(row.snapshot.date)}</td>
                <td className={cellClass}>{formatSnapshotMetric(row.weight)}</td>
                <td className={cellClass}>{formatSnapshotMetric(row.bodyFatPercent, 2, '%')}</td>
                <td className={cellClass}>{formatSnapshotMetric(row.leanTissue, 1)}</td>
                <td className={cellClass}>{formatSnapshotMetric(row.fatMass, 1)}</td>
                <td className={cellClass}>{row.scaleChange}</td>
                <td className={cellClass}>{row.percentChange}</td>
                <td className={`${cellClass} text-right`}>
                  {row.snapshot.sessionNotes ? (
                    <button
                      type="button"
                      aria-label={`View session notes for session ${row.session}`}
                      title="View session notes"
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-app-text-muted dark:hover:bg-app-muted dark:hover:text-app-text"
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewingNotes({
                          session: row.session,
                          date: formatSnapshotDate(row.snapshot.date),
                          notes: row.snapshot.sessionNotes ?? ''
                        });
                      }}
                    >
                      <StickyNote size={pencilSize} />
                    </button>
                  ) : null}
                </td>
                <td className={`${cellClass} text-right`}>
                  <button
                    type="button"
                    aria-label={`Edit session ${row.session}`}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-900 dark:text-app-text-muted dark:hover:bg-app-muted dark:hover:text-app-text"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingSnapshot(row.snapshot);
                    }}
                  >
                    <Pencil size={pencilSize} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {embedded ? (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-app-text-muted">
            Select a session to preview it in the chart, or edit with the pencil.
          </p>
          {table}
        </>
      ) : (
        <Card>
          <h2 className="mb-1 text-lg font-bold">Session Snapshots</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-app-text-muted">Select a session to preview it in the chart, or edit with the pencil.</p>
          {table}
        </Card>
      )}

      <EditSnapshotDrawer
        open={Boolean(editingSnapshot)}
        programId={programId}
        snapshot={editingSnapshot ?? undefined}
        session={editingRow?.session}
        onClose={() => setEditingSnapshot(null)}
        onSaved={onUpdated}
      />

      <Drawer
        open={Boolean(viewingNotes)}
        title={viewingNotes ? `Session ${viewingNotes.session} notes` : 'Session notes'}
        panelClassName="max-w-lg"
        onClose={() => setViewingNotes(null)}
      >
        {viewingNotes ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-app-text-muted">{viewingNotes.date}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-app-text">
              {viewingNotes.notes}
            </p>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
