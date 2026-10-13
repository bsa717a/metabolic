import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Printer, Scale, TrendingUp, Utensils } from 'lucide-react';
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, todayDateParam } from '../services/api';
import type { Dashboard } from '../types';
import { Card } from '../components/ui/Card';

function EmptyChartState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaTo
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  ctaLabel: string;
  ctaTo: string;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-muted/30 px-6 text-center">
      <Icon className="mb-3 h-10 w-10 text-app-text-muted/50" />
      <p className="font-semibold text-app-text">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-app-text-muted">{description}</p>
      <Link
        to={ctaTo}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

export function ProgressPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Dashboard>(`/api/dashboard/today?${todayDateParam()}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const hasWeightData = (data?.weightTrend?.length ?? 0) > 0;
  const hasMacroData = data?.dailyLog && (Number(data.dailyLog.calorieTarget) > 0 || Number(data.dailyLog.caloriesActual) > 0);
  const hasExerciseData = data?.dailyLog && Number(data.dailyLog.exercisesPlanned) > 0;

  const macroData = data?.dailyLog
    ? [
        { name: 'Calories', planned: Number(data.dailyLog.calorieTarget), actual: Number(data.dailyLog.caloriesActual) },
        { name: 'Protein', planned: Number(data.dailyLog.proteinTarget), actual: Number(data.dailyLog.proteinActual) }
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Progress</h1>
          <p className="text-slate-500">Track trends and export a printable progress summary.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/progress/export"
            className="inline-flex items-center rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={loading || !data?.program}
            onClick={(event) => {
              if (loading || !data?.program) event.preventDefault();
            }}
          >
            <Printer className="mr-2 h-4 w-4" />
            Export report
          </Link>
          <Link
            to="/progress/export?print=1"
            className="inline-flex items-center rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
          >
            Quick print
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">Weight over time</h2>
          {hasWeightData ? (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data?.weightTrend ?? []}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line dataKey="weight" stroke="#0f172a" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState
              icon={Scale}
              title="No weight data yet"
              description="Log your weight to see trends over time and track your progress."
              ctaLabel="Log weight"
              ctaTo="/program"
            />
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">Planned vs actual</h2>
          {hasMacroData ? (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={macroData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="planned" fill="#cbd5e1" />
                  <Bar dataKey="actual" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChartState
              icon={Utensils}
              title="No nutrition data yet"
              description="Plan your meals or log what you eat to see how you're tracking."
              ctaLabel="Plan meals"
              ctaTo="/nutrition/plan"
            />
          )}
        </Card>
        <Card>
          <h2 className="font-bold">Exercise completion</h2>
          {hasExerciseData ? (
            <p className="mt-4 text-4xl font-bold">
              {Math.round((Number(data?.dailyLog?.exercisesCompleted ?? 0) / Math.max(Number(data?.dailyLog?.exercisesPlanned ?? 1), 1)) * 100)}
              %
            </p>
          ) : (
            <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-app-border bg-app-muted/30 px-6 py-8 text-center">
              <Dumbbell className="mb-3 h-10 w-10 text-app-text-muted/50" />
              <p className="font-semibold text-app-text">No exercises planned</p>
              <p className="mt-1 max-w-xs text-sm text-app-text-muted">
                Set up your workout routine to track completion.
              </p>
              <Link
                to="/exercise/manage"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
              >
                Set up routine
              </Link>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">Start vs current vs goal</h2>
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-dashed border-app-border bg-app-muted/30 px-6 py-8 text-center">
            <TrendingUp className="mb-3 h-10 w-10 text-app-text-muted/50" />
            <p className="font-semibold text-app-text">View your blueprint</p>
            <p className="mt-1 max-w-xs text-sm text-app-text-muted">
              See Metabolic Blueprint for compact rings, metric table, and detailed goal tracking.
            </p>
            <Link
              to="/program"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
            >
              View blueprint
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
