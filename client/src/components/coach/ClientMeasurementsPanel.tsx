import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { BloodPanelSummary, Program } from '../../types';
import { BloodPanelSection } from '../program/BloodPanelSection';

export function ClientMeasurementsPanel({
  program,
  userId
}: {
  program: Program | null;
  userId: string;
}) {
  const [bloodPanels, setBloodPanels] = useState<BloodPanelSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadBloodPanels = useCallback(async (clientUserId: string) => {
    setLoading(true);
    setError('');
    try {
      const panelRows = await api<BloodPanelSummary[]>(`/api/blood-panels/${clientUserId}`);
      setBloodPanels(panelRows);
    } catch (err) {
      setBloodPanels([]);
      setError(err instanceof Error ? err.message : 'Unable to load blood panels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!program?.id) {
      setBloodPanels([]);
      return;
    }
    void loadBloodPanels(userId);
  }, [loadBloodPanels, program?.id, userId]);

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

  if (loading && bloodPanels.length === 0) {
    return <p className="text-sm text-app-text-muted">Loading blood panels…</p>;
  }

  return (
    <>
      <BloodPanelSection userId={userId} bloodPanels={bloodPanels} onBloodPanelUpdated={upsertBloodPanel} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </>
  );
}
