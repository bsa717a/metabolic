import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import type { UserBadgeView } from '../types/gamification';
import { BadgeDetailModal } from '../components/gamification/BadgeDetailModal';
import { BadgeTile } from '../components/gamification/BadgeTile';

type BadgesResponse = {
  recent: UserBadgeView[];
  categories: Array<{ category: string; badges: UserBadgeView[] }>;
};

const CATEGORY_LABELS: Record<string, string> = {
  GETTING_STARTED: 'Getting started',
  CONSISTENCY: 'Consistency',
  HONEST_TRACKING: 'Honest tracking',
  PROGRESS: 'Progress',
  HABIT: 'Habit'
};

export function BadgesPage() {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<UserBadgeView | null>(null);

  useEffect(() => {
    api<BadgesResponse>('/api/gamification/badges').then(setData);
  }, []);

  return (
    <div className="space-y-10">
      <Link
        to="/level-up"
        className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text"
      >
        <ArrowLeft size={16} /> Level Up
      </Link>
      <h1 className="text-3xl font-bold">Badges</h1>
      <p className="text-sm text-app-text-muted max-w-xl">
        Meaningful milestones — earned through showing up, tracking honestly, and building consistency. Tap a badge
        to zoom in.
      </p>

      {data?.recent.length ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted mb-4">
            Recently earned
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.recent.map((badge) => (
              <BadgeTile key={badge.id} badge={badge} onSelect={setSelectedBadge} />
            ))}
          </div>
        </section>
      ) : null}

      {data?.categories.map(({ category, badges }) => (
        <section key={category}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted mb-4">
            {CATEGORY_LABELS[category] ?? category}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {badges.map((badge) => (
              <BadgeTile key={badge.id} badge={badge} onSelect={setSelectedBadge} />
            ))}
          </div>
        </section>
      ))}

      <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </div>
  );
}
