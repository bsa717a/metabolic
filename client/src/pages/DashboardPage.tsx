import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { api, todayDateParam } from '../services/api';
import { getIdToken } from '../services/auth';
import { DashboardWelcome } from '../components/dashboard/DashboardWelcome';
import { PlanStatusCard } from '../components/dashboard/PlanStatusCard';
import type { AppUser, Dashboard } from '../types';
import { TodayNutrition } from '../components/dashboard/TodayNutrition';
import { TodayExercise } from '../components/dashboard/TodayExercise';
import { MiniBlueprint } from '../components/dashboard/MiniBlueprint';
import { WeightTrendChart } from '../components/dashboard/WeightTrendChart';
import { UpcomingCheckInsCard } from '../components/dashboard/UpcomingCheckInsCard';
import { isCoachRole } from '../utils/roles';
import { useTutorial } from '../components/tutorial/TutorialContext';
import { AUTO_START_DASHBOARD_TUTORIAL } from '../components/tutorial/tutorialPresenterTimeline';
import { SMS_PHONE_DISPLAY, SMS_PHONE_NUMBER } from '../config/sms';

function MacroDonut({
  label,
  actual,
  target,
  unit,
  color
}: {
  label: string;
  actual: number;
  target: number;
  unit?: string;
  color: string;
}) {
  const remaining = Math.round(target - actual);
  const fill = target > 0 ? Math.min(Math.max((actual / target) * 100, 0), 100) : 0;
  const data = [{ value: fill }, { value: Math.max(100 - fill, 0) }];

  return (
    <Link
      to="/nutrition?targets=1"
      className="block rounded-xl text-center transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      aria-label={`Adjust ${label} target`}
    >
      <div className="relative mx-auto h-16 w-16">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} innerRadius={20} outerRadius={30} dataKey="value" startAngle={90} endAngle={-270}>
              <Cell fill={color} />
              <Cell fill="var(--app-progress-track)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-xs font-bold tabular-nums text-app-text">
            {remaining}
            {unit}
          </p>
        </div>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-app-text-muted">{label}</p>
    </Link>
  );
}

function RemainingMacrosDisplay({
  calories,
  protein,
  carbs,
  fat
}: {
  calories: { actual: number; target: number };
  protein: { actual: number; target: number };
  carbs: { actual: number; target: number };
  fat: { actual: number; target: number };
}) {
  return (
    <div data-tour="macros-remaining">
      <div className="grid grid-cols-4 gap-3">
        <MacroDonut label="Kcal" actual={calories.actual} target={calories.target} color="#eab308" />
        <MacroDonut label="Protein" actual={protein.actual} target={protein.target} unit="g" color="#22c55e" />
        <MacroDonut label="Carbs" actual={carbs.actual} target={carbs.target} unit="g" color="#3b82f6" />
        <MacroDonut label="Fat" actual={fat.actual} target={fat.target} unit="g" color="#ef4444" />
      </div>
    </div>
  );
}


export function DashboardPage({ user }: { user?: AppUser | null }) {
  const location = useLocation();
  const { startTour, hasAutoStarted, isActive } = useTutorial();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError('');
    }

    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Not signed in yet. Please refresh or sign in again.');
      }

      const dashboard = await api<Dashboard>(`/api/dashboard/today?${todayDateParam()}&_=${Date.now()}`, {
        cache: 'no-store'
      });
      if (dashboard.program && !dashboard.summary) {
        throw new Error('Dashboard data is incomplete. Restart the backend server and try again.');
      }

      setData(dashboard);
    } catch (err) {
      if (!options?.silent) {
        setData(null);
        setError(err instanceof Error ? err.message : 'Unable to load dashboard');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.pathname !== '/') return;
    void loadDashboard();
  }, [location.pathname, loadDashboard]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && location.pathname === '/') {
        void loadDashboard({ silent: true });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [location.pathname, loadDashboard]);

  useEffect(() => {
    if (!AUTO_START_DASHBOARD_TUTORIAL) return;
    if (loading || error || !data?.program || user?.dashboardTutorialCompletedAt || hasAutoStarted || isActive) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTour();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    loading,
    error,
    data?.program,
    user?.dashboardTutorialCompletedAt,
    hasAutoStarted,
    isActive,
    startTour
  ]);

  if (loading) return <p className="text-app-text-muted">Loading dashboard...</p>;
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-6 text-red-900 dark:text-red-200">
        <h1 className="text-xl font-bold">Dashboard could not load</h1>
        <p className="mt-2 text-sm">{error}</p>
        <p className="mt-4 text-sm text-red-700 dark:text-red-300">
          Check that the backend is running and that Firebase Admin credentials are configured in{' '}
          <code>server/.env</code>.
        </p>
      </div>
    );
  }
  if (!data?.program) {
    return (
      <div className="rounded-2xl border border-brand-green/30 bg-brand-green/10 p-6 text-brand-navy dark:text-brand-off-white">
        <h1 className="text-xl font-bold">No active program yet</h1>
        <p className="mt-2 text-sm text-app-text-muted">
          Finish setting up your program to unlock the dashboard, nutrition, and exercise tools.
        </p>
        <Link
          to="/setup"
          className="mt-4 inline-flex items-center rounded-full bg-brand-navy px-5 py-2.5 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 dark:bg-brand-green dark:text-brand-navy"
        >
          Complete setup
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div data-tour="welcome">
          <DashboardWelcome firstName={user?.firstName} />
        </div>
        <RemainingMacrosDisplay
          calories={{
            actual: Number(data.dailyLog?.caloriesActual ?? 0),
            target: Number(data.dailyLog?.calorieTarget ?? 0)
          }}
          protein={{
            actual: Number(data.dailyLog?.proteinActual ?? 0),
            target: Number(data.dailyLog?.proteinTarget ?? 0)
          }}
          carbs={{
            actual: Number(data.dailyLog?.carbsActual ?? 0),
            target: Number(data.dailyLog?.carbTarget ?? 0)
          }}
          fat={{
            actual: Number(data.dailyLog?.fatActual ?? 0),
            target: Number(data.dailyLog?.fatTarget ?? 0)
          }}
        />
        <PlanStatusCard />
      </div>

      {isCoachRole(user?.role) && (
        <section className="hidden sm:block">
          <UpcomingCheckInsCard />
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div data-tour="today-nutrition">
          <TodayNutrition
            meals={data.meals}
            allMeals={data.allMeals}
            onChange={() => loadDashboard({ silent: true })}
          />
        </div>
        <div data-tour="today-exercise">
          <TodayExercise exercises={data.exercises} onChange={() => loadDashboard({ silent: true })} />
        </div>
        <div data-tour="macro-progress">
          <MiniBlueprint program={data.program} />
        </div>
        <div data-tour="weight-trend">
          <WeightTrendChart program={data.program} weightTrend={data.weightTrend} />
        </div>
      </section>

      <section
        data-tour="sms-quick-log"
        className="rounded-2xl border border-dashed border-app-border bg-app-surface/70 p-6 text-center"
      >
        <h2 className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">Quick Log via SMS</h2>
        <p className="mt-2 text-sm text-app-text-muted max-w-xl mx-auto">
          Text meals, photos, or questions to our AI assistant. To get started, text{' '}
          <strong className="text-brand-navy dark:text-brand-off-white">START</strong> to:
        </p>
        <a
          href={`sms:${SMS_PHONE_NUMBER}?body=START`}
          className="mt-4 inline-block text-lg font-semibold tracking-wide text-brand-green transition hover:text-brand-green-light"
        >
          {SMS_PHONE_DISPLAY}
        </a>
        <p className="mt-3 text-xs text-app-text-muted max-w-lg mx-auto">
          Your phone number must be linked to your Metabolic account. Message and data rates may apply.
        </p>
      </section>
    </div>
  );
}
