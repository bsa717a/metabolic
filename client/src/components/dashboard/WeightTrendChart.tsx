import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Minus, Scale } from 'lucide-react';
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

  if (currentWeight === null) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">Current Weight</h2>
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-app-border bg-app-muted/50 px-6 py-8 text-center">
          <Scale className="mb-3 h-10 w-10 text-app-text-muted/60" aria-hidden />
          <p className="font-semibold text-app-text">No weight logged yet</p>
          <p className="mt-1 max-w-xs text-sm text-app-text-muted">
            Track your weight to see progress over time.
          </p>
          <Link
            to="/program"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            <Scale size={14} />
            Log weight
          </Link>
        </div>
      </Card>
    );
  }

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
            {formatWeight(currentWeight)}
            <span className="ml-1 text-lg font-medium text-app-text-muted">lb</span>
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
