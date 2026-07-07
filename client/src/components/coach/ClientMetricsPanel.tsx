import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarCheck, Pencil } from 'lucide-react';
import { api, toDateKey } from '../../services/api';
import type { Program, ProgramMetric, ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { bodyCompositionMetrics, buildSessionSnapshotPayload } from '../../utils/measurementUtils';
import { formatSnapshotCurrentLabel, metricsWithSnapshotCurrent } from '../../utils/snapshotHistoryUtils';
import { BlueprintCheckInModal } from '../program/BlueprintCheckInModal';
import { BlueprintPhotoComparisonModal } from '../program/BlueprintPhotoComparisonModal';
import { MetricsSummary } from '../program/MetricsSummary';
import { EditMetricsDrawer } from '../program/EditMetricsDrawer';
import { ProgramMetricSnapshotHistory } from '../program/ProgramMetricSnapshotHistory';

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
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInSnapshot, setCheckInSnapshot] = useState<ProgramMetricSnapshot | null>(null);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoSet[]>([]);
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

  const currentLabel = selectedSnapshot ? formatSnapshotCurrentLabel(selectedSnapshot.date) : 'Now';

  const loadProgressPhotos = useCallback(async (programId: string) => {
    try {
      const rows = await api<ProgressPhotoSet[]>(`/api/programs/${programId}/progress-photos`);
      setProgressPhotos(rows);
    } catch {
      setProgressPhotos([]);
    }
  }, []);

  useEffect(() => {
    if (!program) {
      setProgressPhotos([]);
      return;
    }
    void loadProgressPhotos(program.id);
  }, [program, loadProgressPhotos]);

  const checkInPhotoSet = useMemo(() => {
    if (!checkInSnapshot) return null;
    return progressPhotos.find((photoSet) => photoSet.date === checkInSnapshot.date) ?? null;
  }, [checkInSnapshot, progressPhotos]);

  function openCheckIn(snapshot: ProgramMetricSnapshot | null = null) {
    setCheckInSnapshot(snapshot);
    setCheckInOpen(true);
  }

  function closeCheckIn() {
    setCheckInOpen(false);
    setCheckInSnapshot(null);
  }

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

  async function handleCheckInSaved() {
    if (!program) return;
    await Promise.all([onRefresh(), loadProgressPhotos(program.id)]);
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
      <div className="space-y-4">
        <MetricsSummary
          eyebrow="Client metrics"
          metrics={displayMetrics}
          currentLabel={currentLabel}
          onSaveSnapshot={() => void saveSnapshot()}
          savingSnapshot={savingSnapshot}
          todaySnapshotSaved={Boolean(todaySnapshot)}
        />

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-off-white shadow-sm transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
            onClick={() => openCheckIn(todaySnapshot ?? null)}
          >
            <CalendarCheck className="h-4 w-4" />
            Check-in
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
            onClick={() => setComparisonOpen(true)}
          >
            <ArrowLeftRight className="h-4 w-4" />
            Comparison
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
            onClick={() => setMetricsDrawerOpen(true)}
          >
            <Pencil className="h-4 w-4" />
            Edit metrics
          </button>
        </div>

        {selectedSnapshot ? (
          <p className="text-sm text-slate-500 dark:text-app-text-muted">
            Previewing session from {formatSnapshotCurrentLabel(selectedSnapshot.date)}. Metrics reflect this
            session&apos;s values.
          </p>
        ) : null}

        <ProgramMetricSnapshotHistory
          programId={program.id}
          snapshots={snapshots}
          selectedId={selectedSnapshotId}
          onSelect={onSelectSnapshotId}
          onUpdated={() => void onRefresh()}
          onOpenSnapshot={(snapshot) => openCheckIn(snapshot)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <BlueprintPhotoComparisonModal
        open={comparisonOpen}
        snapshots={snapshots}
        progressPhotos={progressPhotos}
        onClose={() => setComparisonOpen(false)}
      />

      <BlueprintCheckInModal
        open={checkInOpen}
        programId={program.id}
        metrics={bodyCompMetrics}
        snapshot={checkInSnapshot}
        photoSet={checkInPhotoSet}
        onClose={closeCheckIn}
        onSaved={handleCheckInSaved}
      />

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
