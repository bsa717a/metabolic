import { useMemo, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import type { ProgramMetricSnapshot } from '../../types';
import {
  buildSnapshotRows,
  formatSnapshotDate,
  formatSnapshotMetric
} from '../../utils/snapshotHistoryUtils';
import { CoachSnapshotHistoryDrawer } from './CoachSnapshotHistoryDrawer';

export function CoachSnapshotPreview({
  programId,
  snapshots,
  selectedId,
  onSelect,
  onSnapshotUpdated
}: {
  programId: string;
  snapshots: ProgramMetricSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSnapshotUpdated: (snapshot: ProgramMetricSnapshot) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const recentRows = useMemo(() => buildSnapshotRows(snapshots).reverse().slice(0, 3), [snapshots]);

  function upsertSnapshot(updated: ProgramMetricSnapshot) {
    onSnapshotUpdated(updated);
  }

  return (
    <>
      <div className="mt-4 rounded-xl border border-app-border bg-app-surface p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Recent snapshots</h3>
            <p className="text-xs text-app-text-muted">Select a snapshot to preview in the comparison table</p>
          </div>
          <button
            type="button"
            aria-label="View all snapshots"
            title="View all snapshots"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
            onClick={() => setDrawerOpen(true)}
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        </div>

        {recentRows.length === 0 ? (
          <p className="text-xs text-app-text-muted">No session snapshots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="text-app-text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Session</th>
                  <th className="py-1.5 pr-3 font-semibold">Date</th>
                  <th className="py-1.5 pr-3 font-semibold">Weight</th>
                  <th className="py-1.5 pr-3 font-semibold">Body Fat %</th>
                  <th className="py-1.5 font-semibold">Scale Change</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((row) => {
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
                      className={`cursor-pointer border-t border-app-border/60 transition ${
                        selected
                          ? 'bg-brand-green/10 ring-1 ring-inset ring-brand-green/30'
                          : 'hover:bg-app-muted'
                      }`}
                    >
                      <td className="py-2 pr-3 font-semibold tabular-nums">{row.session}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatSnapshotDate(row.snapshot.date)}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatSnapshotMetric(row.weight)}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatSnapshotMetric(row.bodyFatPercent, 2, '%')}</td>
                      <td className="py-2 tabular-nums">{row.scaleChange}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CoachSnapshotHistoryDrawer
        open={drawerOpen}
        programId={programId}
        snapshots={snapshots}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={() => setDrawerOpen(false)}
        onUpdated={upsertSnapshot}
      />
    </>
  );
}
