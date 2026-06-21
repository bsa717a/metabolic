import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, todayDateParam } from '../services/api';
import type { Dashboard } from '../types';
import { Card } from '../components/ui/Card';

export function ProgressPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Dashboard>(`/api/dashboard/today?${todayDateParam()}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

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
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">Planned vs actual</h2>
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
        </Card>
        <Card>
          <h2 className="font-bold">Exercise completion</h2>
          <p className="mt-4 text-4xl font-bold">
            {data?.dailyLog
              ? Math.round((Number(data.dailyLog.exercisesCompleted) / Math.max(Number(data.dailyLog.exercisesPlanned), 1)) * 100)
              : 0}
            %
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">Start vs current vs goal</h2>
          <p className="mt-4 text-slate-500">See Metabolic Blueprint for compact rings and metric table.</p>
          <p className="mt-3 text-sm text-slate-500">
            The export report also includes session snapshots, body composition logs, progress photos, and blood panel
            results with reference-range status.
          </p>
        </Card>
      </div>
    </div>
  );
}
