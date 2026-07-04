import { clsx } from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Droplets, Flame } from 'lucide-react';
import { badgeArtUrl } from '../gamification/badgeArt';
import { HydrationTopbarDrawer } from '../hydration/HydrationTopbarDrawer';
import { WaterBottle } from '../hydration/WaterBottle';
import { LevelUpTopbarDrawer } from './LevelUpTopbarDrawer';
import { ProgressRing } from '../gamification/ProgressRing';
import { api, todayDateParam } from '../../services/api';
import type { GamificationDashboard } from '../../types/gamification';
import { useTutorial } from '../tutorial/TutorialContext';
import { getTutorialGamificationData } from '../tutorial/tutorialDemoGamification';

const TOPBAR_RING_SIZE = 44;
const TOPBAR_BADGE_SIZE = 80;
const MOBILE_RING_SIZE = 26;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export function TopbarGamification() {
  const { demoMode, currentStepId } = useTutorial();
  const [data, setData] = useState<GamificationDashboard | null>(null);
  const [hydrationOpen, setHydrationOpen] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const hydrationButtonRef = useRef<HTMLButtonElement>(null);
  const levelUpButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobileViewport();

  const load = useCallback(() => {
    api<GamificationDashboard>(`/api/gamification/dashboard?${todayDateParam()}`)
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

  const view = getTutorialGamificationData(data, demoMode);
  if (!view) return null;

  const { currentLevel, momentum, hydration, recentBadges } = view;
  const tasksDone = currentLevel ? currentLevel.tasks.filter((t) => t.complete).length : 0;
  const tasksTotal = currentLevel?.tasks.length ?? 0;
  const topBadge = recentBadges[0];
  const topBadgeArt = topBadge ? badgeArtUrl(topBadge.id) : null;
  const showFoodStreak = demoMode || momentum.foodLoggingStreak > 0;
  const showWaterStreak = demoMode || hydration.currentStreak > 0;
  const pulseStreaks = demoMode && currentStepId === 'topbar-streaks';

  if (isMobile) {
    return (
      <div className="flex items-center justify-center min-w-0 w-full">
        <div
          className={clsx(
            'flex items-center rounded-full border border-app-border bg-app-muted p-1',
            pulseStreaks && 'animate-pulse'
          )}
        >
          <button
            ref={hydrationButtonRef}
            type="button"
            data-tour="topbar-hydration"
            onClick={() => {
              setLevelUpOpen(false);
              setHydrationOpen((open) => !open);
            }}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition hover:bg-app-border/50"
            title={
              hydration.goalMet
                ? 'Daily hydration goal reached'
                : `${hydration.actualOz}/${hydration.targetOz} oz logged today`
            }
            aria-label="Open hydration"
            aria-expanded={hydrationOpen}
          >
            <Droplets className="size-[18px] shrink-0 text-sky-500" />
            <span className="text-[13px] font-semibold tabular-nums text-app-text">
              {hydration.currentStreak}
            </span>
          </button>

          {showFoodStreak && (
            <>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-app-border" aria-hidden />
              <div
                className="flex items-center gap-1.5 px-3 py-1.5"
                data-tour="topbar-streaks"
                title="Food logging streak"
              >
                <Flame className="size-[18px] shrink-0 text-brand-gold" />
                <span className="text-[13px] font-semibold tabular-nums text-app-text">
                  {momentum.foodLoggingStreak}
                </span>
              </div>
            </>
          )}

          {currentLevel && (
            <>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-app-border" aria-hidden />
              <button
                ref={levelUpButtonRef}
                type="button"
                data-tour="topbar-level"
                onClick={() => {
                  setHydrationOpen(false);
                  setLevelUpOpen((open) => !open);
                }}
                className="flex items-center rounded-full px-2 py-1 transition hover:bg-app-border/50"
                title={`Level ${currentLevel.number} · ${tasksDone}/${tasksTotal} tasks`}
                aria-label={`Level ${currentLevel.number}, ${tasksDone} of ${tasksTotal} tasks complete`}
                aria-expanded={levelUpOpen}
              >
                <ProgressRing
                  percent={currentLevel.progressPercent}
                  size={MOBILE_RING_SIZE}
                  label={`L${currentLevel.number}`}
                  labelClassName="absolute inset-0 flex items-center justify-center font-bold text-brand-green"
                />
              </button>
            </>
          )}
        </div>

        <HydrationTopbarDrawer
          open={hydrationOpen}
          onClose={() => setHydrationOpen(false)}
          anchorRef={hydrationButtonRef}
        />
        {currentLevel && (
          <LevelUpTopbarDrawer
            open={levelUpOpen}
            onClose={() => setLevelUpOpen(false)}
            anchorRef={levelUpButtonRef}
            level={currentLevel}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 min-w-0 w-full max-w-2xl">
      <div
        className="relative shrink-0 self-stretch flex items-center gap-1 sm:gap-1.5"
        data-tour="topbar-hydration"
      >
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
        {showWaterStreak && (
          <div
            className={clsx(
              'flex shrink-0 items-center gap-1.5 text-app-text-muted',
              pulseStreaks && 'animate-pulse'
            )}
            title="Hydration goal streak"
          >
            <Droplets className="size-6 shrink-0 text-sky-500 sm:size-8" />
            <span className="text-base font-bold tabular-nums sm:text-lg">{hydration.currentStreak}d</span>
          </div>
        )}
        <HydrationTopbarDrawer
          open={hydrationOpen}
          onClose={() => setHydrationOpen(false)}
          anchorRef={hydrationButtonRef}
        />
      </div>

      {showFoodStreak && (
        <div
          data-tour="topbar-streaks"
          className={clsx(
            'flex shrink-0 items-center gap-1.5 self-center text-app-text-muted',
            demoMode ? 'flex' : 'hidden sm:flex',
            pulseStreaks && 'animate-pulse'
          )}
        >
          <div className="flex items-center gap-1.5" title="Food logging streak">
            <Flame className="size-6 shrink-0 text-brand-gold sm:size-8" />
            <span className="text-base font-bold tabular-nums sm:text-lg">{momentum.foodLoggingStreak}d</span>
          </div>
        </div>
      )}

      {currentLevel && (
        <div className="relative shrink-0 self-stretch flex items-center" data-tour="topbar-level">
          <button
            ref={levelUpButtonRef}
            type="button"
            onClick={() => {
              setHydrationOpen(false);
              setLevelUpOpen((open) => !open);
            }}
            className="flex h-full min-h-[52px] items-center gap-2 rounded-xl px-1 py-2 sm:gap-3 sm:px-4 sm:py-2.5 transition hover:bg-app-muted/80"
            title={`Level ${currentLevel.number} · ${tasksDone}/${tasksTotal} tasks`}
            aria-label={`Level ${currentLevel.number}, ${tasksDone} of ${tasksTotal} tasks complete`}
            aria-expanded={levelUpOpen}
          >
            <div className="shrink-0">
              <ProgressRing percent={currentLevel.progressPercent} size={TOPBAR_RING_SIZE} />
            </div>
            <div className="shrink-0 text-left leading-tight">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-green">
                Level {currentLevel.number}
              </p>
              <p className="mt-1 text-xs text-app-text-muted tabular-nums">
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
      )}

      <Link
        to="/level-up/badges"
        data-tour="topbar-badge"
        className="shrink-0 transition hover:opacity-90"
        title={topBadge?.name ?? 'View badges'}
        aria-label="View badges"
      >
        {topBadgeArt && topBadge ? (
          <img
            src={topBadgeArt}
            alt=""
            className="size-20 object-contain"
            width={TOPBAR_BADGE_SIZE}
            height={TOPBAR_BADGE_SIZE}
          />
        ) : (
          <Award className="size-20 text-app-text-muted" />
        )}
      </Link>
    </div>
  );
}
