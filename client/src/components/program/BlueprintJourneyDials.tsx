import type { ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import type { ProgramMetric } from '../../types';
import { BLUEPRINT_JOURNEY_METRICS } from '../../utils/journeyDialUtils';
import { Card } from '../ui/Card';
import { JourneyDial } from './JourneyDial';

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

export function BlueprintJourneyDials({
  metrics,
  onSaveSnapshot,
  savingSnapshot = false,
  todaySnapshotSaved = false
}: {
  metrics: ProgramMetric[];
  onSaveSnapshot?: () => void;
  savingSnapshot?: boolean;
  todaySnapshotSaved?: boolean;
}) {
  const byType = new Map(metrics.map((metric) => [metric.metricType, metric]));
  const saveSnapshotLabel = savingSnapshot
    ? 'Saving session snapshot…'
    : todaySnapshotSaved
      ? "Update today's session snapshot"
      : "Save today's session snapshot";

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-text-muted">Blueprint</p>
          <h2 className="text-base font-bold text-brand-navy dark:text-brand-off-white">Journey dials</h2>
        </div>
        {onSaveSnapshot ? (
          <SnapshotButton label={saveSnapshotLabel} disabled={savingSnapshot} onClick={onSaveSnapshot}>
            {savingSnapshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </SnapshotButton>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {BLUEPRINT_JOURNEY_METRICS.map((config) => {
          const metric = byType.get(config.type);
          if (!metric) {
            return (
              <div
                key={config.type}
                className="flex min-w-0 flex-col items-center justify-center rounded-xl bg-app-muted px-1 py-4 text-center"
              >
                <p className="text-[18px] font-semibold uppercase tracking-wide text-app-text-muted">{config.label}</p>
                <p className="mt-1 text-[10px] text-app-text-muted">—</p>
              </div>
            );
          }

          return (
            <JourneyDial
              key={config.type}
              id={config.type}
              label={config.label}
              start={Number(metric.startValue)}
              current={Number(metric.currentValue)}
              goal={Number(metric.goalValue)}
              formatValue={config.format}
              unit={metric.unit}
            />
          );
        })}
      </div>
    </Card>
  );
}
