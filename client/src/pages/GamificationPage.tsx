import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, Award, ArrowLeft, Route } from 'lucide-react';
import { api } from '../services/api';
import type { GamificationCelebration, GamificationDashboard } from '../types/gamification';
import { CurrentLevelCard } from '../components/gamification/CurrentLevelCard';
import { MomentumCard } from '../components/gamification/MomentumCard';
import { RecentBadgesCard } from '../components/gamification/RecentBadgesCard';
import { CelebrationModal } from '../components/gamification/CelebrationModal';
import { JourneyInvitePanel } from '../components/guidedJourney/JourneyInvitePanel';
import { EntitlementError } from '../services/api';
import { UpgradePrompt } from '../components/entitlements/UpgradePrompt';
import { Card } from '../components/ui/Card';

export function GamificationPage() {
  const [data, setData] = useState<GamificationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState<GamificationCelebration | null>(null);
  const [guidedJourneyOn, setGuidedJourneyOn] = useState(false);

  const [entitlementBlocked, setEntitlementBlocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setEntitlementBlocked(false);
    try {
      const dashboard = await api<GamificationDashboard>('/api/gamification/dashboard');
      setData(dashboard);
    } catch (error) {
      if (error instanceof EntitlementError) {
        setEntitlementBlocked(true);
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);

  if (loading) return <p className="text-app-text-muted">Loading your journey…</p>;

  if (entitlementBlocked) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Level Up</h1>
        <UpgradePrompt feature="habit_consistency_scoring" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/"
            className="mb-1 inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text"
          >
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white sm:text-3xl">
            Level Up
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/level-up/journey"
            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold hover:border-brand-green/50"
          >
            <Map size={16} /> Journey
          </Link>
          <Link
            to="/level-up/path"
            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold hover:border-brand-green/50"
          >
            <Route size={16} /> Level path
          </Link>
          <Link
            to="/level-up/badges"
            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm font-semibold hover:border-brand-green/50"
          >
            <Award size={16} /> Badges
          </Link>
        </div>
      </div>

      {/* Immersive world — primary experience on this page */}
      <JourneyInvitePanel onEnabledChange={setGuidedJourneyOn} />

      {data?.currentLevel ? (
        <section
          className={
            guidedJourneyOn ? 'grid gap-6 sm:grid-cols-2' : 'grid gap-6 lg:grid-cols-3'
          }
        >
          {/* Task ladder is superseded by Guided Journey when the flag is on. */}
          {!guidedJourneyOn && <CurrentLevelCard level={data.currentLevel} />}
          <MomentumCard momentum={data.momentum} />
          <RecentBadgesCard badges={data.recentBadges} />
        </section>
      ) : !guidedJourneyOn ? (
        <Card>
          <p className="text-app-text-muted">Your progression will appear here once your program is active.</p>
        </Card>
      ) : null}

      <Card className="border-dashed bg-brand-green/5">
        <p className="text-sm text-app-text-muted">
          Plans change. Log what actually happened so your progress reflects real life. Honest tracking
          helps you spot patterns and make better decisions over time.
        </p>
      </Card>

      <CelebrationModal celebration={celebration} onClose={() => setCelebration(null)} />
    </div>
  );
}
