import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, Award, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import type { GamificationCelebration, GamificationDashboard } from '../types/gamification';
import { CurrentLevelCard } from '../components/gamification/CurrentLevelCard';
import { MomentumCard } from '../components/gamification/MomentumCard';
import { RecentBadgesCard } from '../components/gamification/RecentBadgesCard';
import { CelebrationModal } from '../components/gamification/CelebrationModal';
import { EntitlementError } from '../services/api';
import { UpgradePrompt } from '../components/entitlements/UpgradePrompt';
import { Card } from '../components/ui/Card';

export function GamificationPage() {
  const [data, setData] = useState<GamificationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState<GamificationCelebration | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/"
            className="mb-2 inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text"
          >
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-brand-navy dark:text-brand-off-white">Level Up</h1>
          <p className="mt-2 max-w-xl text-sm text-app-text-muted">
            Consistency matters more than perfection. Learn one step at a time, track honestly, and
            build momentum.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/level-up/journey"
            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-4 py-2 text-sm font-semibold hover:border-brand-green/50"
          >
            <Map size={18} /> Your journey
          </Link>
          <Link
            to="/level-up/badges"
            className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-surface px-4 py-2 text-sm font-semibold hover:border-brand-green/50"
          >
            <Award size={18} /> Badges
          </Link>
        </div>
      </div>

      {data?.currentLevel ? (
        <section className="grid gap-6 lg:grid-cols-3">
          <CurrentLevelCard level={data.currentLevel} />
          <MomentumCard momentum={data.momentum} />
          <RecentBadgesCard badges={data.recentBadges} />
        </section>
      ) : (
        <Card>
          <p className="text-app-text-muted">Your progression will appear here once your program is active.</p>
        </Card>
      )}

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
