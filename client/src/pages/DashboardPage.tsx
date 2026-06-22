import { useCallback, useEffect, useState } from 'react';
import { Target, Apple, Dumbbell, Flame, LineChart, Settings, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, todayDateParam } from '../services/api';
import { getIdToken } from '../services/auth';
import { DashboardWelcome } from '../components/dashboard/DashboardWelcome';
import type { AppUser, Dashboard } from '../types';
import { TodayNutrition } from '../components/dashboard/TodayNutrition';
import { TodayExercise } from '../components/dashboard/TodayExercise';
import { MacroProgress } from '../components/dashboard/MacroProgress';
import { WeightTrendChart } from '../components/dashboard/WeightTrendChart';
import { isAdminRole, isCoachRole } from '../utils/roles';
import { useTutorial } from '../components/tutorial/TutorialContext';
import { SMS_PHONE_DISPLAY, SMS_PHONE_NUMBER } from '../config/sms';

function RemainingMacrosDisplay({
  caloriesRemaining,
  proteinRemaining
}: {
  caloriesRemaining: number;
  proteinRemaining: number;
}) {
  return (
    <div data-tour="macros-remaining">
      {/* Mobile: compact horizontal row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-app-text sm:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Flame size={16} className="text-brand-gold" aria-hidden />
          <span className="tabular-nums">{caloriesRemaining}</span> kcal left
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dumbbell size={16} className="text-brand-green" aria-hidden />
          <span className="tabular-nums">{proteinRemaining}g</span> protein left
        </span>
      </div>

      {/* Desktop: stacked label + big number */}
      <div className="hidden gap-6 sm:flex sm:gap-8 sm:text-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">Calories left</p>
          <p className="text-xl font-semibold tabular-nums text-brand-navy dark:text-brand-off-white">
            {caloriesRemaining}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-app-text-muted">Protein left</p>
          <p className="text-xl font-semibold tabular-nums text-brand-navy dark:text-brand-off-white">
            {proteinRemaining}g
          </p>
        </div>
      </div>
    </div>
  );
}

function DateTimeDisplay() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden text-left sm:block sm:text-right">
      <p className="text-sm font-semibold text-brand-navy dark:text-brand-off-white">
        {now.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-app-text-muted">
        {now.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit'
        })}
      </p>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  tourId
}: {
  to: string;
  icon: typeof Target;
  label: string;
  tourId?: string;
}) {
  return (
    <Link
      to={to}
      data-tour={tourId}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-app-surface border border-app-border p-4 transition-all hover:-translate-y-1 hover:shadow-md hover:border-brand-green/50 text-app-text"
    >
      <Icon size={28} className="text-brand-green dark:text-brand-green-light mb-1" />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

export function DashboardPage({ user }: { user?: AppUser | null }) {
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

      const dashboard = await api<Dashboard>(`/api/dashboard/today?${todayDateParam()}`);
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
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
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

  const s = data.summary!;
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div data-tour="welcome">
          <DashboardWelcome firstName={user?.firstName} />
        </div>
        <RemainingMacrosDisplay
          caloriesRemaining={s.caloriesRemaining}
          proteinRemaining={s.proteinRemaining}
        />
        <DateTimeDisplay />
      </div>

      <section className="hidden sm:block">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted mb-3">Navigation</h2>
        <div
          data-tour="nav-tiles"
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4"
        >
          <QuickLink to="/program" icon={Target} label="Metabolic Blueprint" />
          <QuickLink to="/nutrition" icon={Apple} label="Nutrition" />
          <QuickLink to="/exercise" icon={Dumbbell} label="Exercise" />
          <QuickLink to="/level-up" icon={TrendingUp} label="Level Up" tourId="nav-level-up" />
          <QuickLink to="/progress" icon={LineChart} label="Progress" />
          {isCoachRole(user?.role) && <QuickLink to="/coach" icon={Users} label="Coach" />}
          {isAdminRole(user?.role) && <QuickLink to="/admin" icon={Settings} label="Admin" />}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div data-tour="today-nutrition">
          <TodayNutrition meals={data.meals} onChange={() => loadDashboard({ silent: true })} />
        </div>
        <div data-tour="today-exercise">
          <TodayExercise exercises={data.exercises} onChange={() => loadDashboard({ silent: true })} />
        </div>
        <div data-tour="macro-progress">
          <MacroProgress dashboard={data} />
        </div>
        <div data-tour="weight-trend">
          <WeightTrendChart data={data.weightTrend} />
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
