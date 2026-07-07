import type { ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import type { ProgramMetric } from '../../types';
import { BLUEPRINT_JOURNEY_METRICS } from '../../utils/journeyDialUtils';
import { Card } from '../ui/Card';

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

export function CoachMetricsSummary({
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-text-muted">Client metrics</p>
          <h2 className="text-base font-bold text-brand-navy dark:text-brand-off-white">Start · {currentLabel} · Goal</h2>
        </div>
        {onSaveSnapshot ? (
          <SnapshotButton label={saveSnapshotLabel} disabled={savingSnapshot} onClick={onSaveSnapshot}>
            {savingSnapshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          </SnapshotButton>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800 text-white dark:bg-app-muted dark:text-app-text">
            <tr>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Metric</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Start</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">{currentLabel}</th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide">Goal</th>
            </tr>
          </thead>
          <tbody>
            {BLUEPRINT_JOURNEY_METRICS.map((config) => {
              const metric = byType.get(config.type);
              if (!metric) return null;

              const start = Number(metric.startValue);
              const current = Number(metric.currentValue);
              const goal = Number(metric.goalValue);

              return (
                <tr key={config.type} className="border-t border-app-border">
                  <td className="px-3 py-2.5 font-semibold text-app-text">{config.label}</td>
                  <td className="px-3 py-2.5 tabular-nums text-app-text-muted">
                    {config.format(start, metric.unit)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-app-text">
                    {config.format(current, metric.unit)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-app-text-muted">
                    {config.format(goal, metric.unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
