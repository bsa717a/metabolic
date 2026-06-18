import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { BloodPanelSummary, Program, ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { SnapshotTrackingSection } from '../program/SnapshotTrackingSection';

export function ClientMeasurementsPanel({
  program,
  userId
}: {
  program: Program | null;
  userId: string;
}) {
  const [snapshots, setSnapshots] = useState<ProgramMetricSnapshot[]>([]);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhotoSet[]>([]);
  const [bloodPanels, setBloodPanels] = useState<BloodPanelSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async (programId: string, clientUserId: string) => {
    setLoading(true);
    setError('');
    try {
      const [snapshotRows, photoRows, panelRows] = await Promise.all([
        api<ProgramMetricSnapshot[]>(`/api/programs/${programId}/metric-snapshots`),
        api<ProgressPhotoSet[]>(`/api/programs/${programId}/progress-photos`),
        api<BloodPanelSummary[]>(`/api/blood-panels/${clientUserId}`)
      ]);
      setSnapshots(snapshotRows);
      setProgressPhotos(photoRows);
      setBloodPanels(panelRows);
    } catch (err) {
      setSnapshots([]);
      setProgressPhotos([]);
      setBloodPanels([]);
      setError(err instanceof Error ? err.message : 'Unable to load measurements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!program?.id) {
      setSnapshots([]);
      setProgressPhotos([]);
      setBloodPanels([]);
      return;
    }
    void loadData(program.id, userId);
  }, [loadData, program?.id, userId]);

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

  if (!program) {
    return (
      <p className="rounded-xl bg-app-muted p-4 text-sm text-app-text-muted">
        No active program found for this client.
      </p>
    );
  }

  if (loading && snapshots.length === 0 && progressPhotos.length === 0 && bloodPanels.length === 0) {
    return <p className="text-sm text-app-text-muted">Loading measurements…</p>;
  }

  return (
    <>
      <SnapshotTrackingSection
        programId={program.id}
        userId={userId}
        snapshots={snapshots}
        progressPhotos={progressPhotos}
        bloodPanels={bloodPanels}
        onSnapshotUpdated={upsertSnapshot}
        onProgressPhotosUpdated={upsertProgressPhoto}
        onBloodPanelUpdated={upsertBloodPanel}
      />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  );
}
