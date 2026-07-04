import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { Program } from '../../types';
import { Card } from '../ui/Card';

function formatWeight(value: number) {
  return (Math.round(value * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function WeightTrendChart({
  program,
  weightTrend
}: {
  program: Program | null;
  weightTrend: { date: string; weight: number }[];
}) {
  // Prefer the program's WEIGHT metric (authoritative current + program start) over the
  // weightTrend array, which only holds the oldest 30 daily logs and can be stale/empty.
  const weightMetric = program?.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const currentWeight = weightMetric
    ? Number(weightMetric.currentValue)
    : weightTrend.length
      ? weightTrend[weightTrend.length - 1].weight
      : null;
  const startWeight = weightMetric
    ? Number(weightMetric.startValue)
    : weightTrend.length
      ? weightTrend[0].weight
      : null;
  const delta =
    currentWeight !== null && startWeight !== null ? Math.round((currentWeight - startWeight) * 10) / 10 : null;

  const trend = delta === null || delta === 0 ? 'flat' : delta < 0 ? 'down' : 'up';

  const pillStyles = {
    down: 'bg-brand-green/10 text-brand-green',
    up: 'bg-red-500/10 text-red-600 dark:text-red-400',
    flat: 'bg-app-muted text-app-text-muted'
  }[trend];

  const pillLabel =
    delta === null
      ? 'No data yet'
      : delta === 0
        ? 'No change'
        : `${formatWeight(Math.abs(delta))} lb ${delta < 0 ? 'lost' : 'gained'}`;

  return (
    <Link
      to="/progress"
      className="block rounded-2xl transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      aria-label="View progress"
    >
      <Card>
        <h2 className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">Current Weight</h2>
        <div className="mt-4 space-y-3">
          <p className="text-4xl font-bold tabular-nums text-app-text">
            {currentWeight !== null ? (
              <>
                {formatWeight(currentWeight)}
                <span className="ml-1 text-lg font-medium text-app-text-muted">lb</span>
              </>
            ) : (
              <span className="text-lg font-medium text-app-text-muted">No weight logged</span>
            )}
          </p>
          <div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${pillStyles}`}
            >
              {trend === 'down' && <ArrowDown size={16} aria-hidden />}
              {trend === 'up' && <ArrowUp size={16} aria-hidden />}
              {trend === 'flat' && <Minus size={16} aria-hidden />}
              {pillLabel}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
