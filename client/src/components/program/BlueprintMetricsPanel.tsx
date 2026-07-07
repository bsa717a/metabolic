import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Camera, Loader2 } from 'lucide-react';
import type { ProgramMetric } from '../../types';
import { Card } from '../ui/Card';
import { JourneyDialsGrid } from './JourneyDialsGrid';
import { MetricsSummaryTable } from './MetricsSummaryTable';

export type BlueprintMetricsView = 'table' | 'dials';

function defaultMetricsView(): BlueprintMetricsView {
  if (typeof window === 'undefined') return 'dials';
  return window.matchMedia('(min-width: 768px)').matches ? 'dials' : 'table';
}

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

function MetricsViewToggle({
  view,
  onChange
}: {
  view: BlueprintMetricsView;
  onChange: (view: BlueprintMetricsView) => void;
}) {
  const segmentClass = (active: boolean) =>
    clsx(
      'rounded-full px-3 py-1 text-xs font-semibold transition',
      active ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-text-muted hover:text-app-text'
    );

  return (
    <div
      role="tablist"
      aria-label="Metrics view"
      className="flex shrink-0 items-center rounded-full border border-app-border bg-app-muted p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'table'}
        className={segmentClass(view === 'table')}
        onClick={() => onChange('table')}
      >
        Table
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'dials'}
        className={segmentClass(view === 'dials')}
        onClick={() => onChange('dials')}
      >
        Dials
      </button>
    </div>
  );
}

export function BlueprintMetricsPanel({
  metrics,
  currentLabel = 'Now',
  onSaveSnapshot,
  savingSnapshot = false,
  todaySnapshotSaved = false
}: {
  metrics: ProgramMetric[];
  currentLabel?: string;
  onSaveSnapshot?: () => void;
  savingSnapshot?: boolean;
  todaySnapshotSaved?: boolean;
}) {
  const [view, setView] = useState<BlueprintMetricsView>(defaultMetricsView);
  const saveSnapshotLabel = savingSnapshot
    ? 'Saving session snapshot…'
    : todaySnapshotSaved
      ? "Update today's session snapshot"
      : "Save today's session snapshot";

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-text-muted">Blueprint</p>
          <h2 className="text-base font-bold text-brand-navy dark:text-brand-off-white">Journey dials</h2>
        </div>
        <div className="flex items-center gap-2">
          <MetricsViewToggle view={view} onChange={setView} />
          {onSaveSnapshot ? (
            <SnapshotButton label={saveSnapshotLabel} disabled={savingSnapshot} onClick={onSaveSnapshot}>
              {savingSnapshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </SnapshotButton>
          ) : null}
        </div>
      </div>

      {view === 'table' ? <MetricsSummaryTable metrics={metrics} currentLabel={currentLabel} /> : <JourneyDialsGrid metrics={metrics} />}
    </Card>
  );
}
