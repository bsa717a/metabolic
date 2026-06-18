import { useMemo, useState } from 'react';
import { api, toDateKey } from '../../services/api';
import type { Program, ProgramMetric, ProgramMetricSnapshot } from '../../types';
import { bodyCompositionMetrics, buildSessionSnapshotPayload } from '../../utils/measurementUtils';
import {
  formatSnapshotCurrentLabel,
  metricsWithSnapshotCurrent
} from '../../utils/snapshotHistoryUtils';
import { EditMetricsDrawer } from '../program/EditMetricsDrawer';
import { ProgramDonutSummary } from '../program/ProgramDonutSummary';
import { ProgramMetricTable } from '../program/ProgramMetricTable';

function normalizeMetric(metric: ProgramMetric): ProgramMetric {
  return {
    ...metric,
    startValue: Number(metric.startValue),
    currentValue: Number(metric.currentValue),
    goalValue: Number(metric.goalValue)
  };
}

export function ClientMetricsPanel({
  program,
  snapshots,
  selectedSnapshotId,
  onSelectSnapshotId,
  onRefresh
}: {
  program: Program | null;
  snapshots: ProgramMetricSnapshot[];
  selectedSnapshotId: string | null;
  onSelectSnapshotId: (id: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [metricsDrawerOpen, setMetricsDrawerOpen] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [error, setError] = useState('');

  const metrics = useMemo(
    () => (program?.metrics ?? []).map(normalizeMetric),
    [program?.metrics]
  );

  const todaySnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.date === toDateKey(new Date())),
    [snapshots]
  );

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  const bodyCompMetrics = useMemo(() => bodyCompositionMetrics(metrics), [metrics]);

  const displayMetrics = useMemo(
    () => metricsWithSnapshotCurrent(bodyCompMetrics, selectedSnapshot),
    [bodyCompMetrics, selectedSnapshot]
  );

  const currentLabel = selectedSnapshot ? formatSnapshotCurrentLabel(selectedSnapshot.date) : 'Current';

  async function saveSnapshot() {
    if (!program) return;
    setSavingSnapshot(true);
    setError('');
    try {
      const payload = buildSessionSnapshotPayload(bodyCompMetrics, todaySnapshot ?? null);
      if (payload.some((metric) => !Number.isFinite(metric.currentValue))) {
        throw new Error('Please enter valid current values before saving a session snapshot.');
      }
      const snapshot = await api<ProgramMetricSnapshot>(`/api/programs/${program.id}/metric-snapshots`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      onSelectSnapshotId(snapshot.id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save session snapshot');
    } finally {
      setSavingSnapshot(false);
    }
  }

  async function handleMetricsSaved() {
    await onRefresh();
  }

  if (!program) {
    return (
      <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
        No active program found for this client.
      </p>
    );
  }

  if (!bodyCompMetrics.length) {
    return (
      <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
        No metrics configured for this program yet.
      </p>
    );
  }

  return (
    <>
      <ProgramDonutSummary
        metrics={displayMetrics}
        currentLabel={currentLabel}
        onSaveSnapshot={() => void saveSnapshot()}
        savingSnapshot={savingSnapshot}
        todaySnapshotSaved={Boolean(todaySnapshot)}
      />
      <div className="mt-4">
        <ProgramMetricTable
          compact
          metrics={displayMetrics}
          currentLabel={currentLabel}
          onEdit={() => setMetricsDrawerOpen(true)}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <EditMetricsDrawer
        open={metricsDrawerOpen}
        programId={program.id}
        metrics={bodyCompMetrics}
        onClose={() => setMetricsDrawerOpen(false)}
        onSaved={handleMetricsSaved}
      />
    </>
  );
}
