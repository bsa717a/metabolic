import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarCheck, Flag, Target } from 'lucide-react';
import { api, toDateKey } from '../services/api';
import type { AppUser, Program, ProgramMetric } from '../types';
import { BlueprintActionsMenu } from '../components/program/BlueprintActionsMenu';
import { BlueprintCheckInModal } from '../components/program/BlueprintCheckInModal';
import { BlueprintPhotoComparisonModal } from '../components/program/BlueprintPhotoComparisonModal';
import { EditBlueprintGoalsDrawer } from '../components/program/EditBlueprintGoalsDrawer';
import { EditBlueprintStartDrawer } from '../components/program/EditBlueprintStartDrawer';
import { BlueprintMetricsPanel } from '../components/program/BlueprintMetricsPanel';
import { ProgramMetricSnapshotHistory } from '../components/program/ProgramMetricSnapshotHistory';
import type { ProgramMetricSnapshot, ProgressPhotoSet } from '../types';
import { bodyCompositionMetrics, buildSessionSnapshotPayload } from '../utils/measurementUtils';
import { formatSnapshotCurrentLabel } from '../utils/snapshotHistoryUtils';

function normalizeMetric(metric: ProgramMetric): ProgramMetric {
  return {
    ...metric,
    startValue: Number(metric.startValue),
    currentValue: Number(metric.currentValue),
    goalValue: Number(metric.goalValue)
  };
}

export function ProgramPage(_props: { user?: AppUser | null }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [metrics, setMetrics] = useState<ProgramMetric[]>([]);
  const [snapshots, setSnapshots] = useState<ProgramMetricSnapshot[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoSet[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [startDrawerOpen, setStartDrawerOpen] = useState(false);
  const [goalsDrawerOpen, setGoalsDrawerOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInSnapshot, setCheckInSnapshot] = useState<ProgramMetricSnapshot | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [error, setError] = useState('');
  const [snapshotError, setSnapshotError] = useState('');

  const loadProgressPhotos = useCallback(async (programId: string) => {
    try {
      const rows = await api<ProgressPhotoSet[]>(`/api/programs/${programId}/progress-photos`);
      setProgressPhotos(rows);
      setPhotosLoaded(true);
    } catch {
      setProgressPhotos([]);
    }
  }, []);

  const loadSnapshots = useCallback(async (programId: string) => {
    setSnapshotsLoading(true);
    try {
      const rows = await api<ProgramMetricSnapshot[]>(`/api/programs/${programId}/metric-snapshots`);
      setSnapshots(rows);
      setSelectedSnapshotId((current) => (current && rows.some((row) => row.id === current) ? current : null));
      setSnapshotError('');
    } catch (err) {
      setSnapshots([]);
      setSelectedSnapshotId(null);
      setSnapshotError(err instanceof Error ? err.message : 'Unable to load session snapshots');
    } finally {
      setSnapshotsLoading(false);
    }
  }, []);

  const loadBlueprintProgram = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setProgramLoading(true);
      setError('');
    }
    try {
      const active = await api<Program | null>('/api/programs/blueprint');
      setProgram(active);
      setMetrics((active?.metrics ?? []).map(normalizeMetric));
      if (active) {
        setSnapshotsLoading(true);
      } else {
        setSnapshots([]);
        setSnapshotsLoading(false);
        setProgressPhotos([]);
        setSelectedSnapshotId(null);
        setPhotosLoaded(false);
      }
    } catch (err) {
      setProgram(null);
      setMetrics([]);
      setError(err instanceof Error ? err.message : 'Unable to load program');
    } finally {
      if (!options?.silent) setProgramLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBlueprintProgram();
  }, [loadBlueprintProgram]);

  const programId = program?.id ?? null;

  useEffect(() => {
    if (!programId) return;
    void loadSnapshots(programId);
  }, [programId, loadSnapshots]);

  useEffect(() => {
    if (!programId || (!comparisonOpen && !checkInOpen)) return;
    void loadProgressPhotos(programId);
  }, [programId, comparisonOpen, checkInOpen, loadProgressPhotos]);

  const bodyCompMetrics = useMemo(() => bodyCompositionMetrics(metrics), [metrics]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  const todaySnapshot = snapshots.find((snapshot) => snapshot.date === toDateKey(new Date()));

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

  async function handleCheckInSaved() {
    if (!program) return;
    await Promise.all([loadBlueprintProgram({ silent: true }), loadSnapshots(program.id)]);
    if (photosLoaded || checkInOpen || comparisonOpen) {
      await loadProgressPhotos(program.id);
    }
  }

  function upsertSnapshot(updated: ProgramMetricSnapshot) {
    setSnapshots((current) => {
      const index = current.findIndex((snapshot) => snapshot.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.date.localeCompare(a.date));
      return current.map((snapshot) => (snapshot.id === updated.id ? updated : snapshot));
    });
    void loadBlueprintProgram({ silent: true });
  }

  async function saveSnapshot() {
    if (!program) return;
    setSavingSnapshot(true);
    setSnapshotError('');
    try {
      const payload = buildSessionSnapshotPayload(bodyCompMetrics, todaySnapshot ?? null);
      if (payload.some((metric) => !Number.isFinite(metric.currentValue))) {
        throw new Error('Please enter valid current values before saving a session snapshot.');
      }
      const snapshot = await api<ProgramMetricSnapshot>(`/api/programs/${program.id}/metric-snapshots`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await loadSnapshots(program.id);
      setSelectedSnapshotId(snapshot.id);
      await loadBlueprintProgram({ silent: true });
    } catch (err) {
      setSnapshotError(err instanceof Error ? err.message : 'Unable to save session snapshot');
    } finally {
      setSavingSnapshot(false);
    }
  }

  if (programLoading) return <p>Loading program...</p>;
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
        <div className="space-y-3 md:relative md:flex md:flex-wrap md:items-start md:justify-between md:gap-3 md:space-y-0">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">Metabolic Blueprint</h1>
            <p className="text-slate-500">Where intention meets results.</p>
          </div>
          <div className="flex w-full items-center justify-between gap-2 md:contents">
            <button
              type="button"
              className="inline-flex shrink-0 items-center rounded-xl bg-brand-navy px-5 py-2 text-sm font-semibold text-brand-off-white shadow-sm transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light md:absolute md:left-1/2 md:top-0 md:-translate-x-1/2"
              onClick={() => openCheckIn(todaySnapshot ?? null)}
            >
              <CalendarCheck className="mr-2 h-4 w-4" />
              Check-in
            </button>
            <div className="ml-auto flex flex-wrap gap-2">
              <div className="md:hidden">
                <BlueprintActionsMenu
                  onComparison={() => setComparisonOpen(true)}
                  onStart={() => setStartDrawerOpen(true)}
                  onGoals={() => setGoalsDrawerOpen(true)}
                />
              </div>
              <div className="hidden flex-wrap gap-2 md:flex">
                <button
                  type="button"
                  className="inline-flex items-center rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
                  onClick={() => setComparisonOpen(true)}
                >
                  <ArrowLeftRight className="mr-2 h-4 w-4" />
                  Comparison
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
                  onClick={() => setStartDrawerOpen(true)}
                >
                  <Flag className="mr-2 h-4 w-4" />
                  Start
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
                  onClick={() => setGoalsDrawerOpen(true)}
                >
                  <Target className="mr-2 h-4 w-4" />
                  Goals
                </button>
              </div>
            </div>
          </div>
        </div>
        <BlueprintMetricsPanel
          metrics={bodyCompMetrics}
          onSaveSnapshot={() => void saveSnapshot()}
          savingSnapshot={savingSnapshot}
          todaySnapshotSaved={Boolean(todaySnapshot)}
        />
        {selectedSnapshot ? (
          <p className="text-sm text-slate-500">
            Previewing session from {formatSnapshotCurrentLabel(selectedSnapshot.date)}. Metrics show your live current
            values.
          </p>
        ) : null}
        {snapshotsLoading ? (
          <p className="text-sm text-slate-500">Loading session history…</p>
        ) : (
          <ProgramMetricSnapshotHistory
            programId={program.id}
            snapshots={snapshots}
            selectedId={selectedSnapshotId}
            onSelect={setSelectedSnapshotId}
            onUpdated={upsertSnapshot}
            onOpenSnapshot={(snapshot) => openCheckIn(snapshot)}
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {snapshotError && <p className="text-sm text-red-600">{snapshotError}</p>}
      </div>

      <BlueprintPhotoComparisonModal
        open={comparisonOpen}
        programId={program.id}
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

      <EditBlueprintStartDrawer
        open={startDrawerOpen}
        programId={program.id}
        metrics={bodyCompMetrics}
        onClose={() => setStartDrawerOpen(false)}
        onSaved={() => loadBlueprintProgram({ silent: true })}
      />

      <EditBlueprintGoalsDrawer
        open={goalsDrawerOpen}
        programId={program.id}
        metrics={bodyCompMetrics}
        onClose={() => setGoalsDrawerOpen(false)}
        onSaved={() => loadBlueprintProgram({ silent: true })}
      />
    </>
  );
}
