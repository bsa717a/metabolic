import type { ProgramMetric } from '../../types';
import { BLUEPRINT_JOURNEY_METRICS } from '../../utils/journeyDialUtils';

export function MetricsSummaryTable({
  metrics,
  currentLabel = 'Now'
}: {
  metrics: ProgramMetric[];
  currentLabel?: string;
}) {
  const byType = new Map(metrics.map((metric) => [metric.metricType, metric]));

  return (
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
  );
}
