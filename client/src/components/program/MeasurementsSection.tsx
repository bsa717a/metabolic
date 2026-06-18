import { useMemo, useState } from 'react';
import { toDateKey } from '../../services/api';
import type { BloodPanelSummary, Program, ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { BloodPanelSection } from './BloodPanelSection';
import { EditMeasurementsDrawer } from './EditMeasurementsDrawer';
import { MeasurementsSummaryRow } from './MeasurementsSummaryRow';

export function MeasurementsSection({
  programId,
  userId,
  snapshots,
  progressPhotos,
  bloodPanels,
  selectedSnapshot,
  onBloodPanelUpdated,
  onRefresh,
  compact = false
}: {
  programId: string;
  userId: string;
  program: Program;
  snapshots: ProgramMetricSnapshot[];
  progressPhotos: ProgressPhotoSet[];
  bloodPanels: BloodPanelSummary[];
  selectedSnapshot?: ProgramMetricSnapshot | null;
  onSnapshotUpdated: (snapshot: ProgramMetricSnapshot) => void;
  onBloodPanelUpdated: (panel: BloodPanelSummary) => void;
  onRefresh: () => void | Promise<void>;
  compact?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const todayUtc = toDateKey(new Date());
  const todaySnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.date === todayUtc) ?? null,
    [snapshots, todayUtc]
  );

  const activeSnapshot = selectedSnapshot ?? todaySnapshot;
  const activeDate = activeSnapshot?.date ?? todayUtc;
  const activePhotoSet = useMemo(
    () => progressPhotos.find((photoSet) => photoSet.date === activeDate) ?? null,
    [activeDate, progressPhotos]
  );

  async function handleSaved() {
    await onRefresh();
  }

  return (
    <div className="space-y-6">
      <MeasurementsSummaryRow
        compact={compact}
        sessionDate={activeDate}
        snapshot={activeSnapshot}
        photoSet={activePhotoSet}
        onClick={() => setDrawerOpen(true)}
      />

      <BloodPanelSection userId={userId} bloodPanels={bloodPanels} onBloodPanelUpdated={onBloodPanelUpdated} />

      <EditMeasurementsDrawer
        open={drawerOpen}
        programId={programId}
        sessionDate={activeDate}
        snapshot={activeSnapshot}
        photoSet={activePhotoSet}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
