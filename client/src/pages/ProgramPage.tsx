import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarCheck, Flag, Target } from 'lucide-react';
import { api, toDateKey } from '../services/api';
import type { AppUser, Program, ProgramMetric } from '../types';
import { BlueprintCheckInModal } from '../components/program/BlueprintCheckInModal';
import { BlueprintPhotoComparisonModal } from '../components/program/BlueprintPhotoComparisonModal';
import { EditBlueprintGoalsDrawer } from '../components/program/EditBlueprintGoalsDrawer';
import { EditBlueprintStartDrawer } from '../components/program/EditBlueprintStartDrawer';
import { BlueprintJourneyDials } from '../components/program/BlueprintJourneyDials';
import { ProgramMetricSnapshotHistory } from '../components/program/ProgramMetricSnapshotHistory';
import type { ProgramMetricSnapshot, ProgressPhotoSet } from '../types';
import { bodyCompositionMetrics, buildSessionSnapshotPayload } from '../utils/measurementUtils';
import { formatSnapshotCurrentLabel } from '../utils/snapshotHistoryUtils';
import { isAdminRole, isCoachRole } from '../utils/roles';

function normalizeMetric(metric: ProgramMetric): ProgramMetric {
  return {
    ...metric,
    startValue: Number(metric.startValue),
    currentValue: Number(metric.currentValue),
    goalValue: Number(metric.goalValue)
  };
}

export function ProgramPage({ user }: { user?: AppUser | null }) {
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
  const [loading, setLoading] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [error, setError] = useState('');
  const [snapshotError, setSnapshotError] = useState('');

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

  const loadProgram = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError('');
    }
    try {
      const rows = await api<Program[]>('/api/programs');
      // Prefer the signed-in user's OWN program so a regular user never sees anyone else's
      // data on their personal Blueprint page. Admins/coaches receive every program from the
      // API and legitimately need to view one, so they fall back to the first available.
      const ownProgram = user?.id ? rows.find((row) => row.userId === user.id) ?? null : null;
      const canViewAny = isAdminRole(user?.role) || isCoachRole(user?.role);
      const active = ownProgram ?? (canViewAny ? rows[0] ?? null : null);
      setProgram(active);
      setMetrics((active?.metrics ?? []).map(normalizeMetric));
      if (active) {
        await Promise.all([loadSnapshots(active.id), loadProgressPhotos(active.id)]);
      } else {
        setSnapshots([]);
        setProgressPhotos([]);
        setSelectedSnapshotId(null);
      }
    } catch (err) {
      setProgram(null);
      setError(err instanceof Error ? err.message : 'Unable to load program');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [loadSnapshots, loadProgressPhotos, user?.id, user?.role]);

  useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  const bodyCompMetrics = useMemo(() => bodyCompositionMetrics(metrics), [metrics]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  const todaySnapshot = snapshots.find((snapshot) => snapshot.date === toDateKey(new Date()));

  const checkInPhotoSet = useMemo(() => {
    // Only prefill photos when editing an existing session (today's saved snapshot or a
    // history row). A brand-new check-in starts with an empty photo area so it feels fresh.
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
    await Promise.all([loadProgram({ silent: true }), loadSnapshots(program.id), loadProgressPhotos(program.id)]);
  }

  function upsertSnapshot(updated: ProgramMetricSnapshot) {
    setSnapshots((current) => {
      const index = current.findIndex((snapshot) => snapshot.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.date.localeCompare(a.date));
      return current.map((snapshot) => (snapshot.id === updated.id ? updated : snapshot));
    });
    void loadProgram({ silent: true });
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
      await loadProgram({ silent: true });
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
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">Metabolic Blueprint</h1>
            <p className="text-slate-500">Where intention meets results.</p>
          </div>
          <button
            type="button"
            className="absolute left-1/2 top-0 inline-flex -translate-x-1/2 items-center rounded-xl bg-brand-navy px-5 py-2 text-sm font-semibold text-brand-off-white shadow-sm transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
            onClick={() => openCheckIn(todaySnapshot ?? null)}
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            Check-in
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
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
        <BlueprintJourneyDials
          metrics={bodyCompMetrics}
          onSaveSnapshot={() => void saveSnapshot()}
          savingSnapshot={savingSnapshot}
          todaySnapshotSaved={Boolean(todaySnapshot)}
        />
        {selectedSnapshot ? (
          <p className="text-sm text-slate-500">
            Previewing session from {formatSnapshotCurrentLabel(selectedSnapshot.date)}. Journey dials show your live
            current values.
          </p>
        ) : null}
        <ProgramMetricSnapshotHistory
          programId={program.id}
          snapshots={snapshots}
          selectedId={selectedSnapshotId}
          onSelect={setSelectedSnapshotId}
          onUpdated={upsertSnapshot}
          onOpenSnapshot={(snapshot) => openCheckIn(snapshot)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {snapshotError && <p className="text-sm text-red-600">{snapshotError}</p>}
      </div>

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

      <EditBlueprintStartDrawer
        open={startDrawerOpen}
        programId={program.id}
        metrics={bodyCompMetrics}
        onClose={() => setStartDrawerOpen(false)}
        onSaved={() => loadProgram({ silent: true })}
      />

      <EditBlueprintGoalsDrawer
        open={goalsDrawerOpen}
        programId={program.id}
        metrics={bodyCompMetrics}
        onClose={() => setGoalsDrawerOpen(false)}
        onSaved={() => loadProgram({ silent: true })}
      />
    </>
  );
}
