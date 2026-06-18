import type { ProgramMetricSnapshot } from '../../types';
import { ProgramMetricSnapshotHistory } from '../program/ProgramMetricSnapshotHistory';
import { Drawer } from '../ui/Drawer';

export function CoachSnapshotHistoryDrawer({
  open,
  programId,
  snapshots,
  selectedId,
  onSelect,
  onClose,
  onUpdated
}: {
  open: boolean;
  programId: string;
  snapshots: ProgramMetricSnapshot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  onUpdated: (snapshot: ProgramMetricSnapshot) => void;
}) {
  return (
    <Drawer open={open} title="Session snapshots" panelClassName="max-w-4xl" onClose={onClose}>
      <ProgramMetricSnapshotHistory
        compact
        embedded
        programId={programId}
        snapshots={snapshots}
        selectedId={selectedId}
        onSelect={onSelect}
        onUpdated={onUpdated}
      />
    </Drawer>
  );
}
