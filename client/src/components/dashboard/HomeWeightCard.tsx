import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Scale } from 'lucide-react';
import { api, dateKeyInTimeZone, parseDateKey } from '../../services/api';
import type { Program, ProgramMetricSnapshot } from '../../types';
import { Card } from '../ui/Card';
import { LogWeightSheet } from './LogWeightSheet';
import {
  formatWeight,
  latestWeightPoint,
  mergeWeightSnapshot,
  normalizeWeightUnit,
  storedWeightUnit,
  weightPointsFromSnapshots,
  weightUnitLabel,
  type WeightPoint
} from '../../utils/weightLog';

function formatWeightDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatAxisDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

function WeightHistoryGraph({ points, unitLabel }: { points: WeightPoint[]; unitLabel: string }) {
  if (!points.length) {
    return (
      <div
        data-testid="weight-history-graph"
        className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-muted/40 px-4 text-center text-sm text-app-text-muted"
      >
        Your weight history will show up here.
      </div>
    );
  }

  const weights = points.map((point) => point.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const pad = Math.max((max - min) * 0.25, 0.5);

  return (
    <div data-testid="weight-history-graph" className="h-36 w-full min-w-0" aria-label="Weight history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fontSize: 11, fill: 'var(--app-text-muted)' }}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            width={36}
            tick={{ fontSize: 11, fill: 'var(--app-text-muted)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => String(Math.round(value))}
          />
          <Tooltip
            formatter={(value) => [`${formatWeight(Number(value))} ${unitLabel}`, 'Weight']}
            labelFormatter={(label) => formatWeightDate(String(label))}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="var(--app-chart-line)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--app-chart-line)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.date}>
            {formatWeightDate(point.date)}: {formatWeight(point.weight)} {unitLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomeWeightCard({
  program,
  timeZone,
  onRecorded,
  sourceSnapshots,
  todayOverride,
  initialSheetOpen = false,
  initialConfirmation = ''
}: {
  program: Program;
  timeZone?: string | null;
  onRecorded?: () => void;
  /** Fixture snapshots. When set, the card does not fetch. */
  sourceSnapshots?: ProgramMetricSnapshot[];
  todayOverride?: string;
  initialSheetOpen?: boolean;
  initialConfirmation?: string;
}) {
  const usingFixtures = sourceSnapshots !== undefined;
  const [fetchedSnapshots, setFetchedSnapshots] = useState<ProgramMetricSnapshot[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const snapshots = fetchedSnapshots ?? sourceSnapshots ?? [];
  const loading = !usingFixtures && fetchedSnapshots === null && !loadError;
  const today = todayOverride ?? dateKeyInTimeZone(timeZone);
  const [sheet, setSheet] = useState<{ open: boolean; date: string }>({
    open: initialSheetOpen,
    date: today
  });
  const [confirmation, setConfirmation] = useState(initialConfirmation);
  const [editDate, setEditDate] = useState<string | null>(initialConfirmation ? today : null);

  useEffect(() => {
    if (usingFixtures) return;

    let cancelled = false;
    void api<ProgramMetricSnapshot[]>(`/api/programs/${program.id}/metric-snapshots`)
      .then((rows) => {
        if (cancelled) return;
        setFetchedSnapshots(rows);
        setLoadError('');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load weight history');
      });

    return () => {
      cancelled = true;
    };
  }, [program.id, reloadToken, usingFixtures]);

  const weightMetric = program.metrics.find((metric) => metric.metricType === 'WEIGHT');
  const preferredUnit = normalizeWeightUnit(weightMetric?.unit);
  const unitLabel = weightUnitLabel(weightMetric?.unit);
  const points = weightPointsFromSnapshots(snapshots, preferredUnit);
  const latest = latestWeightPoint(points);

  function openSheet(date: string) {
    setSheet({ open: true, date });
  }

  function handleSaved(snapshot: ProgramMetricSnapshot, message: string) {
    setFetchedSnapshots((current) => mergeWeightSnapshot(current ?? sourceSnapshots ?? [], snapshot));
    setConfirmation(message);
    setEditDate(snapshot.date);
    setSheet({ open: false, date: snapshot.date });
    if (!usingFixtures) setReloadToken((token) => token + 1);
    onRecorded?.();
  }

  return (
    <Card data-testid="weight-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">Weight</h2>
          {latest ? (
            <>
              <p className="mt-2 text-4xl font-bold tabular-nums text-app-text" data-testid="latest-weight">
                {formatWeight(latest.weight)}
                <span className="ml-1 text-lg font-medium text-app-text-muted">{unitLabel}</span>
              </p>
              <p className="mt-1 text-sm text-app-text-muted" data-testid="latest-weight-date">
                {formatWeightDate(latest.date)}
              </p>
            </>
          ) : (
            <div className="mt-3">
              <p className="font-semibold text-app-text">No weight logged yet</p>
              <p className="mt-1 text-sm text-app-text-muted">Log a weigh-in to see your latest weight and history.</p>
            </div>
          )}
        </div>
        <button
          type="button"
          data-testid="log-weight-button"
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-brand-navy px-4 py-2.5 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 sm:w-auto dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          onClick={() => openSheet(today)}
        >
          <Scale size={16} aria-hidden />
          Log weight
        </button>
      </div>

      {confirmation ? (
        <p
          role="status"
          data-testid="weight-confirmation"
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-brand-green/10 px-3 py-2 text-sm text-app-text"
        >
          <span>{confirmation}</span>
          {editDate ? (
            <button
              type="button"
              className="font-semibold text-brand-green underline-offset-2 hover:underline"
              onClick={() => openSheet(editDate)}
            >
              Edit
            </button>
          ) : null}
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {loadError} You can still log a weigh-in.
        </p>
      ) : null}

      <div className="mt-4" data-tour="weight-trend">
        {loading && !points.length ? (
          <p className="flex h-36 items-center justify-center text-sm text-app-text-muted">Loading weight history…</p>
        ) : (
          <WeightHistoryGraph points={points} unitLabel={unitLabel} />
        )}
      </div>

      <p className="mt-4 text-sm text-app-text-muted">
        <Link
          to="/program"
          data-testid="full-check-in-link"
          className="font-semibold text-brand-green underline-offset-2 hover:underline"
        >
          Full check-in
        </Link>{' '}
        for body measurements and photos.
      </p>

      {sheet.open ? (
        <LogWeightSheet
          programId={program.id}
          points={points}
          preferredUnit={preferredUnit}
          storedUnit={storedWeightUnit(weightMetric?.unit)}
          today={today}
          initialDate={sheet.date}
          historyReady={!loading}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
          onSaved={handleSaved}
        />
      ) : null}
    </Card>
  );
}
