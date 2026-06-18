import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, toDateKey } from '../../services/api';
import type { Program, ProgramMetric, ProgramMetricSnapshot } from '../../types';
import {
  formatSnapshotCurrentLabel,
  metricsWithSnapshotCurrent
} from '../../utils/snapshotHistoryUtils';
import { EditMetricsDrawer } from '../program/EditMetricsDrawer';
import { ProgramMetricTable } from '../program/ProgramMetricTable';
import { CoachSnapshotPreview } from './CoachSnapshotPreview';

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
  onRefresh
}: {
  program: Program | null;
  onRefresh: () => Promise<void>;
}) {
  const [metrics, setMetrics] = useState<ProgramMetric[]>([]);
  const [snapshots, setSnapshots] = useState<ProgramMetricSnapshot[]>([]);
  const [metricsDrawerOpen, setMetricsDrawerOpen] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setMetrics((program?.metrics ?? []).map(normalizeMetric));
    setSelectedSnapshotId(null);
  }, [program]);

  const loadSnapshots = useCallback(async (programId: string) => {
    try {
      const rows = await api<ProgramMetricSnapshot[]>(`/api/programs/${programId}/metric-snapshots`);
      setSnapshots(rows);
      setSelectedSnapshotId((current) => (current && rows.some((row) => row.id === current) ? current : null));
      setError('');
    } catch (err) {
      setSnapshots([]);
      setError(err instanceof Error ? err.message : 'Unable to load session snapshots');
    }
  }, []);

  useEffect(() => {
    if (!program?.id) {
      setSnapshots([]);
      return;
    }
    void loadSnapshots(program.id);
  }, [loadSnapshots, program?.id]);

  const todaySnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.date === toDateKey(new Date())),
    [snapshots]
  );

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  const displayMetrics = useMemo(
    () => metricsWithSnapshotCurrent(metrics, selectedSnapshot),
    [metrics, selectedSnapshot]
  );

  const currentLabel = selectedSnapshot ? formatSnapshotCurrentLabel(selectedSnapshot.date) : 'Current';

  async function saveSnapshot() {
    if (!program) return;
    setSavingSnapshot(true);
    setError('');
    try {
      const payload = metrics.map((metric) => ({
        metricType: metric.metricType,
        currentValue: Number(metric.currentValue),
        unit: metric.unit
      }));
      if (payload.some((metric) => !Number.isFinite(metric.currentValue))) {
        throw new Error('Please enter valid current values before saving a session snapshot.');
      }
      const snapshot = await api<ProgramMetricSnapshot>(`/api/programs/${program.id}/metric-snapshots`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await loadSnapshots(program.id);
      setSelectedSnapshotId(snapshot.id);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save session snapshot');
    } finally {
      setSavingSnapshot(false);
    }
  }

  async function handleMetricsSaved() {
    await onRefresh();
    if (program?.id) await loadSnapshots(program.id);
  }

  function handleSnapshotUpdated(updated: ProgramMetricSnapshot) {
    setSnapshots((current) => current.map((snapshot) => (snapshot.id === updated.id ? updated : snapshot)));
  }

  if (!program) {
    return (
      <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
        No active program found for this client.
      </p>
    );
  }

  if (!metrics.length) {
    return (
      <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
        No metrics configured for this program yet.
      </p>
    );
  }

  return (
    <>
      <ProgramMetricTable
        compact
        metrics={displayMetrics}
        currentLabel={currentLabel}
        onEdit={() => setMetricsDrawerOpen(true)}
        onSaveSnapshot={() => void saveSnapshot()}
        savingSnapshot={savingSnapshot}
        todaySnapshotSaved={Boolean(todaySnapshot)}
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <CoachSnapshotPreview
        programId={program.id}
        snapshots={snapshots}
        selectedId={selectedSnapshotId}
        onSelect={setSelectedSnapshotId}
        onSnapshotUpdated={handleSnapshotUpdated}
      />

      <EditMetricsDrawer
        open={metricsDrawerOpen}
        programId={program.id}
        metrics={metrics}
        onClose={() => setMetricsDrawerOpen(false)}
        onSaved={handleMetricsSaved}
      />
    </>
  );
}
