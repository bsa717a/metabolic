import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Droplets, Flame, TrendingUp } from 'lucide-react';
import { badgeArtUrl } from '../gamification/badgeArt';
import { HydrationTopbarDrawer } from '../hydration/HydrationTopbarDrawer';
import { WaterBottle } from '../hydration/WaterBottle';
import { LevelUpTopbarDrawer } from './LevelUpTopbarDrawer';
import { ProgressRing } from '../gamification/ProgressRing';
import { api } from '../../services/api';
import type { GamificationDashboard } from '../../types/gamification';

const TOPBAR_RING_SIZE = 44;
const TOPBAR_MOBILE_ICON = 20;
const TOPBAR_BADGE_SIZE = 80;

export function TopbarGamification() {
  const [data, setData] = useState<GamificationDashboard | null>(null);
  const [hydrationOpen, setHydrationOpen] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const hydrationButtonRef = useRef<HTMLButtonElement>(null);
  const levelUpButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    api<GamificationDashboard>('/api/gamification/dashboard')
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('hydration-updated', refresh);
    return () => window.removeEventListener('hydration-updated', refresh);
  }, [load]);

  if (!data?.currentLevel) return null;

  const { currentLevel, momentum, hydration, recentBadges } = data;
  const tasksDone = currentLevel.tasks.filter((t) => t.complete).length;
  const tasksTotal = currentLevel.tasks.length;
  const topBadge = recentBadges[0];
  const topBadgeArt = topBadge ? badgeArtUrl(topBadge.id) : null;

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 min-w-0 w-full max-w-2xl">
      <div className="relative shrink-0 self-stretch flex items-center">
        <button
          ref={hydrationButtonRef}
          type="button"
          onClick={() => {
            setLevelUpOpen(false);
            setHydrationOpen((open) => !open);
          }}
          className="flex h-full min-h-[52px] items-center rounded-xl px-2.5 py-1.5 transition hover:bg-app-muted/80"
          title={
            hydration.goalMet
              ? 'Daily hydration goal reached'
              : `${hydration.actualOz}/${hydration.targetOz} oz logged today`
          }
          aria-label="Open hydration"
          aria-expanded={hydrationOpen}
        >
          <WaterBottle
            fillFraction={hydration.fillFraction}
            goalMet={hydration.goalMet}
            targetOz={hydration.targetOz}
            size="sm"
          />
        </button>
        <HydrationTopbarDrawer
          open={hydrationOpen}
          onClose={() => setHydrationOpen(false)}
          anchorRef={hydrationButtonRef}
        />
      </div>

      <div className="relative shrink-0 self-stretch flex items-center">
        <button
          ref={levelUpButtonRef}
          type="button"
          onClick={() => {
            setHydrationOpen(false);
            setLevelUpOpen((open) => !open);
          }}
          className="flex h-full min-h-[52px] items-center gap-3 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 transition hover:bg-app-muted/80"
          title={`Level ${currentLevel.number}`}
          aria-label="Open level up tasks"
          aria-expanded={levelUpOpen}
        >
          <div className="shrink-0 hidden sm:block">
            <ProgressRing percent={currentLevel.progressPercent} size={TOPBAR_RING_SIZE} />
          </div>
          <TrendingUp
            size={TOPBAR_MOBILE_ICON}
            className="shrink-0 text-brand-green sm:hidden"
            aria-hidden
          />
          <div className="shrink-0 text-left leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-green">
              Level {currentLevel.number}
            </p>
            <p className="mt-1 text-[11px] sm:text-xs text-app-text-muted tabular-nums">
              {tasksDone}/{tasksTotal} tasks
            </p>
          </div>
        </button>
        <LevelUpTopbarDrawer
          open={levelUpOpen}
          onClose={() => setLevelUpOpen(false)}
          anchorRef={levelUpButtonRef}
          level={currentLevel}
        />
      </div>

      {momentum.foodLoggingStreak > 0 && (
        <div
          className="hidden sm:flex self-center items-center gap-1.5 shrink-0 text-app-text-muted"
          title="Food logging streak"
        >
          <Flame className="size-6 sm:size-8 shrink-0 text-brand-gold" />
          <span className="text-base sm:text-lg font-bold tabular-nums">{momentum.foodLoggingStreak}d</span>
        </div>
      )}

      {hydration.currentStreak > 0 && (
        <div
          className="hidden sm:flex self-center items-center gap-1.5 shrink-0 text-app-text-muted"
          title="Hydration goal streak"
        >
          <Droplets className="size-6 sm:size-8 shrink-0 text-sky-500" />
          <span className="text-base sm:text-lg font-bold tabular-nums">{hydration.currentStreak}d</span>
        </div>
      )}

      <Link
        to="/level-up/badges"
        className="shrink-0 transition hover:opacity-90"
        title={topBadge?.name ?? 'View badges'}
        aria-label="View badges"
      >
        {topBadgeArt && topBadge ? (
          <img
            src={topBadgeArt}
            alt=""
            className="size-[45px] object-contain sm:size-20"
            width={TOPBAR_BADGE_SIZE}
            height={TOPBAR_BADGE_SIZE}
          />
        ) : (
          <Award className="size-[45px] text-app-text-muted sm:size-20" />
        )}
      </Link>
    </div>
  );
}
