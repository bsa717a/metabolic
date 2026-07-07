import type { ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import type { ProgramMetric } from '../../types';
import { Card } from '../ui/Card';
import { MetricsSummaryTable } from './MetricsSummaryTable';

function SnapshotButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg text-app-text-muted transition hover:bg-app-muted disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MetricsSummary({
  metrics,
  currentLabel = 'Now',
  eyebrow = 'Metrics',
  onSaveSnapshot,
  savingSnapshot = false,
  todaySnapshotSaved = false
}: {
  metrics: ProgramMetric[];
  currentLabel?: string;
  eyebrow?: string;
  onSaveSnapshot?: () => void;
  savingSnapshot?: boolean;
  todaySnapshotSaved?: boolean;
}) {
  const saveSnapshotLabel = savingSnapshot
    ? 'Saving session snapshot…'
    : todaySnapshotSaved
      ? "Update today's session snapshot"
      : "Save today's session snapshot";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-text-muted">{eyebrow}</p>
          <h2 className="text-base font-bold text-brand-navy dark:text-brand-off-white">Start · {currentLabel} · Goal</h2>
        </div>
        {onSaveSnapshot ? (
          <SnapshotButton label={saveSnapshotLabel} disabled={savingSnapshot} onClick={onSaveSnapshot}>
            {savingSnapshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </SnapshotButton>
        ) : null}
      </div>

      <MetricsSummaryTable metrics={metrics} currentLabel={currentLabel} />
    </Card>
  );
}
