import { clsx } from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Award, Droplets, Flame } from 'lucide-react';
import { badgeArtUrl } from '../gamification/badgeArt';
import { HydrationTopbarDrawer } from '../hydration/HydrationTopbarDrawer';
import { WaterBottle } from '../hydration/WaterBottle';
import { ProgressRing } from '../gamification/ProgressRing';
import { GUIDED_JOURNEY_UPDATED_EVENT } from '../../lib/guidedJourneyEvents';
import { OPEN_HYDRATION_DRAWER_EVENT } from '../hydration/hydrationEvents';
import { api, todayDateParam } from '../../services/api';
import type { GamificationDashboard } from '../../types/gamification';
import type { GuidedJourneyState } from '../../types/guidedJourney';
import { useTutorial } from '../tutorial/TutorialContext';
import { getTutorialGamificationData } from '../tutorial/tutorialDemoGamification';

const TOPBAR_RING_SIZE = 28;
const TOPBAR_BADGE_SIZE = 28;
const MOBILE_RING_SIZE = 26;
const JOURNEY_MOUNTAIN_SRC = '/journey/topbar-mountain.png?v=1';

function CapsuleDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-app-border" aria-hidden />;
}

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

function JourneyTopbarLink({
  onJourney,
  trailDone,
  trailTotal,
  journeyPercent,
  isMobile,
  className
}: {
  onJourney: boolean;
  trailDone: number;
  trailTotal: number;
  journeyPercent: number;
  isMobile: boolean;
  className?: string;
}) {
  const title = onJourney
    ? `Journey · ${trailDone}/${trailTotal || 1} discoveries`
    : 'Begin your Journey';
  const ariaLabel = onJourney
    ? `Guided Journey, ${trailDone} of ${trailTotal || 1} discoveries complete`
    : 'Open Guided Journey';

  return (
    <Link
      to="/level-up/journey"
      data-tour="topbar-level"
      className={clsx(
        'flex items-center rounded-full px-2 py-1 transition hover:bg-app-border/50 hover:opacity-90',
        !isMobile && onJourney && 'gap-1.5',
        className
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {onJourney ? (
        <>
          <ProgressRing
            percent={journeyPercent}
            size={isMobile ? MOBILE_RING_SIZE : TOPBAR_RING_SIZE}
            label="J"
            labelClassName={clsx(
              'absolute inset-0 flex items-center justify-center font-bold text-brand-green',
              !isMobile && 'text-[10px]'
            )}
          />
          {!isMobile && (
            <span className="text-[13px] tabular-nums text-app-text-muted">
              {trailDone}/{trailTotal || 1}
            </span>
          )}
        </>
      ) : (
        <img
          src={JOURNEY_MOUNTAIN_SRC}
          alt=""
          aria-hidden
          width={isMobile ? 22 : 28}
          height={isMobile ? 22 : 28}
          className={clsx('shrink-0 object-contain', isMobile ? 'size-[22px]' : 'size-7')}
          draggable={false}
        />
      )}
    </Link>
  );
}

export function TopbarGamification() {
  const { demoMode, currentStepId } = useTutorial();
  const location = useLocation();
  const [data, setData] = useState<GamificationDashboard | null>(null);
  const [journey, setJourney] = useState<GuidedJourneyState | null>(null);
  const [hydrationOpen, setHydrationOpen] = useState(false);
  const hydrationButtonRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobileViewport();

  const load = useCallback(() => {
    api<GamificationDashboard>(`/api/gamification/dashboard?${todayDateParam()}`)
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const loadJourney = useCallback(() => {
    if (demoMode) {
      setJourney(null);
      return;
    }
    api<GuidedJourneyState>('/api/guided-journey')
      .then(setJourney)
      .catch(() => setJourney(null));
  }, [demoMode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      load();
      loadJourney();
    };
    window.addEventListener('hydration-updated', refresh);
    window.addEventListener(GUIDED_JOURNEY_UPDATED_EVENT, loadJourney);
    window.addEventListener('focus', loadJourney);
    return () => {
      window.removeEventListener('hydration-updated', refresh);
      window.removeEventListener(GUIDED_JOURNEY_UPDATED_EVENT, loadJourney);
      window.removeEventListener('focus', loadJourney);
    };
  }, [load, loadJourney]);

  useEffect(() => {
    function openDrawer() {
      setHydrationOpen(true);
    }
    window.addEventListener(OPEN_HYDRATION_DRAWER_EVENT, openDrawer);
    return () => window.removeEventListener(OPEN_HYDRATION_DRAWER_EVENT, openDrawer);
  }, []);

  const view = getTutorialGamificationData(data, demoMode);
  if (!view) return null;

  const { momentum, hydration, recentBadges } = view;
  const topBadge = recentBadges[0];
  const topBadgeArt = topBadge ? badgeArtUrl(topBadge.id) : null;
  const showFoodStreak = demoMode || momentum.foodLoggingStreak > 0;
  const showWaterStreak = demoMode || hydration.currentStreak > 0;
  const pulseStreaks = demoMode && currentStepId === 'topbar-streaks';

  const journeyMode = Boolean(!demoMode && journey?.enabled);
  const onJourney = Boolean(journey?.enrollment);
  const trailDone = journey?.trail.filter((stop) => stop.completed).length ?? 0;
  const trailTotal = journey?.trail.length ?? 0;
  const journeyPercent = trailTotal > 0 ? Math.round((trailDone / trailTotal) * 100) : onJourney ? 5 : 0;

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

          {journeyMode ? (
            <>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-app-border" aria-hidden />
              <JourneyTopbarLink
                onJourney={onJourney}
                trailDone={trailDone}
                trailTotal={trailTotal}
                journeyPercent={journeyPercent}
                isMobile
              />
            </>
          ) : null}
        </div>

        <HydrationTopbarDrawer
          open={hydrationOpen}
          onClose={() => setHydrationOpen(false)}
          anchorRef={hydrationButtonRef}
        />
      </div>
    );
  }

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
          <WaterBottle
            fillFraction={hydration.fillFraction}
            goalMet={hydration.goalMet}
            targetOz={hydration.targetOz}
            size="xs"
          />
          {showWaterStreak && (
            <>
              <Droplets className="size-[18px] shrink-0 text-sky-500" />
              <span className="text-[13px] font-semibold tabular-nums text-app-text">
                {hydration.currentStreak}d
              </span>
            </>
          )}
        </button>

        {showFoodStreak && (
          <>
            <CapsuleDivider />
            <div
              className="flex items-center gap-1.5 px-3 py-1.5"
              data-tour="topbar-streaks"
              title="Food logging streak"
            >
              <Flame className="size-[18px] shrink-0 text-brand-gold" />
              <span className="text-[13px] font-semibold tabular-nums text-app-text">
                {momentum.foodLoggingStreak}d
              </span>
            </div>
          </>
        )}

        {journeyMode ? (
          <>
            <CapsuleDivider />
            <JourneyTopbarLink
              onJourney={onJourney}
              trailDone={trailDone}
              trailTotal={trailTotal}
              journeyPercent={journeyPercent}
              isMobile={false}
            />
          </>
        ) : null}

        <CapsuleDivider />
        <Link
          to="/level-up/badges"
          data-tour="topbar-badge"
          className="flex items-center rounded-full px-2 py-1 transition hover:bg-app-border/50 hover:opacity-90"
          title={topBadge?.name ?? 'View badges'}
          aria-label="View badges"
        >
          {topBadgeArt && topBadge ? (
            <img
              src={topBadgeArt}
              alt=""
              className="size-7 object-contain"
              width={TOPBAR_BADGE_SIZE}
              height={TOPBAR_BADGE_SIZE}
            />
          ) : (
            <Award className="size-7 text-app-text-muted" />
          )}
        </Link>
      </div>

      <HydrationTopbarDrawer
        open={hydrationOpen}
        onClose={() => setHydrationOpen(false)}
        anchorRef={hydrationButtonRef}
      />
    </div>
  );
}
