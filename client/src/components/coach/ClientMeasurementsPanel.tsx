import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import type { BloodPanelSummary, Program, ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { MeasurementsSection } from '../program/MeasurementsSection';

export function ClientMeasurementsPanel({
  program,
  userId,
  snapshots,
  selectedSnapshotId,
  onRefresh
}: {
  program: Program | null;
  userId: string;
  snapshots: ProgramMetricSnapshot[];
  selectedSnapshotId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoSet[]>([]);
  const [bloodPanels, setBloodPanels] = useState<BloodPanelSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (programId: string, clientUserId: string) => {
    setLoading(true);
    setError('');
    try {
      const [photoRows, panelRows] = await Promise.all([
        api<ProgressPhotoSet[]>(`/api/programs/${programId}/progress-photos`),
        api<BloodPanelSummary[]>(`/api/blood-panels/${clientUserId}`)
      ]);
      setProgressPhotos(photoRows);
      setBloodPanels(panelRows);
    } catch (err) {
      setProgressPhotos([]);
      setBloodPanels([]);
      setError(err instanceof Error ? err.message : 'Unable to load measurements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!program?.id) {
      setProgressPhotos([]);
      setBloodPanels([]);
      return;
    }
    void loadData(program.id, userId);
  }, [loadData, program?.id, userId]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId]
  );

  function upsertBloodPanel(updated: BloodPanelSummary) {
    setBloodPanels((current) => {
      const index = current.findIndex((panel) => panel.id === updated.id);
      if (index === -1) return [updated, ...current].sort((a, b) => b.labDate.localeCompare(a.labDate));
      return current.map((panel) => (panel.id === updated.id ? updated : panel));
    });
  }

  async function handleRefresh() {
    if (program?.id) await loadData(program.id, userId);
    await onRefresh();
  }

  if (!program) {
    return (
      <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
        No active program found for this client.
      </p>
    );
  }

  if (loading && progressPhotos.length === 0 && bloodPanels.length === 0) {
    return <p className="text-sm text-app-text-muted">Loading measurements…</p>;
  }

  return (
    <>
      <MeasurementsSection
        compact
        programId={program.id}
        userId={userId}
        program={program}
        snapshots={snapshots}
        progressPhotos={progressPhotos}
        bloodPanels={bloodPanels}
        selectedSnapshot={selectedSnapshot}
        onSnapshotUpdated={() => void onRefresh()}
        onBloodPanelUpdated={upsertBloodPanel}
        onRefresh={handleRefresh}
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  );
}
