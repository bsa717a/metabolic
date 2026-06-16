import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { Program, ProgramMetric } from '../types';
import { EditMetricsDrawer } from '../components/program/EditMetricsDrawer';
import { ProgramDonutSummary } from '../components/program/ProgramDonutSummary';
import { ProgramMetricTable } from '../components/program/ProgramMetricTable';
import { ProgramMetricSnapshotHistory } from '../components/program/ProgramMetricSnapshotHistory';
import { SnapshotTrackingSection } from '../components/program/SnapshotTrackingSection';
import { todayKey } from '../services/api';
import type { ProgramMetricSnapshot, ProgressPhotoSet, BloodPanelSummary } from '../types';

function normalizeMetric(metric: ProgramMetric): ProgramMetric {
  return {
    ...metric,
    startValue: Number(metric.startValue),
    currentValue: Number(metric.currentValue),
    goalValue: Number(metric.goalValue)
  };
}

function metricsWithSnapshotCurrent(metrics: ProgramMetric[], snapshot: ProgramMetricSnapshot | null) {
  if (!snapshot) return metrics;
  return metrics.map((metric) => {
    const saved = snapshot.values.find((value) => value.metricType === metric.metricType);
    if (!saved) return metric;
    return { ...metric, currentValue: Number(saved.currentValue) };
  });
}

function formatSnapshotLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return `Current (${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })})`;
}

export function ProgramPage() {
  const [program, setProgram] = useState<Program | null>(null);
  const [metrics, setMetrics] = useState<ProgramMetric[]>([]);
  const [snapshots, setSnapshots] = useState<ProgramMetricSnapshot[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoSet[]>([]);
  const [bloodPanels, setBloodPanels] = useState<BloodPanelSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [metricsDrawerOpen, setMetricsDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [error, setError] = useState('');
  const [snapshotError, setSnapshotError] = useState('');

  const loadBloodPanels = useCallback(async (userId: string) => {
    try {
      const rows = await api<BloodPanelSummary[]>(`/api/blood-panels/${userId}`);
      setBloodPanels(rows);
    } catch {
      setBloodPanels([]);
    }
  }, []);

  const loadProgressPhotos = useCallback(async (programId: string) => {
    try {
      const rows = await api<ProgressPhotoSet[]>(`/api/programs/${programId}/progress-photos`);
      setProgressPhotos(rows);
    } catch {
      setProgressPhotos([]);
    }
  }, []);

  const loadSnapshots = useCallback(async (programId: string) => {
    try {
      const rows = await api<ProgramMetricSnapshot[]>(`/api/programs/${programId}/metric-snapshots`);
      setSnapshots(rows);
      setSelectedSnapshotId((current) => (current && rows.some((row) => row.id === current) ? current : null));
      setSnapshotError('');
    } catch (err) {
      setSnapshots([]);
      setSelectedSnapshotId(null);
      setSnapshotError(err instanceof Error ? err.message : 'Unable to load session snapshots');
    }
  }, []);

  const loadProgram = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<Program[]>('/api/programs');
      const active = rows[0] ?? null;
      setProgram(active);
      setMetrics((active?.metrics ?? []).map(normalizeMetric));
      if (active) {
        await Promise.all([loadSnapshots(active.id), loadProgressPhotos(active.id), loadBloodPanels(active.userId)]);
      } else {
        setSnapshots([]);
        setProgressPhotos([]);
        setBloodPanels([]);
        setSelectedSnapshotId(null);
      }
    } catch (err) {
      setProgram(null);
      setError(err instanceof Error ? err.message : 'Unable to load program');
    } finally {
      setLoading(false);
    }
  }, [loadSnapshots, loadProgressPhotos, loadBloodPanels]);

  useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  const chartMetrics = useMemo(
    () => metricsWithSnapshotCurrent(metrics, selectedSnapshot),
    [metrics, selectedSnapshot]
  );

  const currentChartLabel = selectedSnapshot ? formatSnapshotLabel(selectedSnapshot.date) : 'Current';
  const todaySnapshot = snapshots.find((snapshot) => snapshot.date === todayKey());

  function upsertSnapshot(updated: ProgramMetricSnapshot) {
    setSnapshots((current) => {
      const index = current.findIndex((snapshot) => snapshot.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.date.localeCompare(a.date));
      return current.map((snapshot) => (snapshot.id === updated.id ? updated : snapshot));
    });
  }

  function upsertProgressPhoto(updated: ProgressPhotoSet) {
    setProgressPhotos((current) => {
      const index = current.findIndex((photoSet) => photoSet.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.date.localeCompare(a.date));
      return current.map((photoSet) => (photoSet.id === updated.id ? updated : photoSet));
    });
  }

  function upsertBloodPanel(updated: BloodPanelSummary) {
    setBloodPanels((current) => {
      const index = current.findIndex((panel) => panel.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.labDate.localeCompare(a.labDate));
      return current.map((panel) => (panel.id === updated.id ? updated : panel));
    });
  }

  async function saveSnapshot() {
    if (!program) return;
    setSavingSnapshot(true);
    setSnapshotError('');
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
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : 'Unable to save session snapshot');
    } finally {
      setSavingSnapshot(false);
    }
  }

  if (loading) return <p>Loading program...</p>;
  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="text-xl font-bold">Program could not load</h1>
        <p className="mt-2 text-sm">{error}</p>
      </div>
    );
  }
  if (!program) {
    return (
      <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-6 text-yellow-900">
        <h1 className="text-xl font-bold">No program yet</h1>
        <p className="mt-2 text-sm">Your account does not have a program attached yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-24">
        <div>
          <h1 className="text-3xl font-bold">Metabolic Blueprint</h1>
          <p className="text-slate-500">Where intention meets results.</p>
        </div>
        <ProgramDonutSummary metrics={chartMetrics} currentLabel={currentChartLabel} />
        <ProgramMetricTable
          metrics={metrics}
          onEdit={() => setMetricsDrawerOpen(true)}
          onSaveSnapshot={saveSnapshot}
          savingSnapshot={savingSnapshot}
          todaySnapshotSaved={Boolean(todaySnapshot)}
        />
        <ProgramMetricSnapshotHistory
          programId={program.id}
          snapshots={snapshots}
          selectedId={selectedSnapshotId}
          onSelect={setSelectedSnapshotId}
          onUpdated={upsertSnapshot}
        />
        <SnapshotTrackingSection
          programId={program.id}
          userId={program.userId}
          snapshots={snapshots}
          progressPhotos={progressPhotos}
          bloodPanels={bloodPanels}
          onSnapshotUpdated={upsertSnapshot}
          onProgressPhotosUpdated={upsertProgressPhoto}
          onBloodPanelUpdated={upsertBloodPanel}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {snapshotError && <p className="text-sm text-red-600">{snapshotError}</p>}
      </div>

      <EditMetricsDrawer
        open={metricsDrawerOpen}
        programId={program.id}
        metrics={metrics}
        onClose={() => setMetricsDrawerOpen(false)}
        onSaved={loadProgram}
      />
    </>
  );
}
