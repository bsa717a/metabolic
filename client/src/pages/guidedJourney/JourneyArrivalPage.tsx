import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { GuidedJourneyState } from '../../types/guidedJourney';
import { Button } from '../../components/ui/Button';
import { JourneyOverlayCard } from '../../components/guidedJourney/JourneyOverlayCard';
import { JourneySceneFrame } from '../../components/guidedJourney/JourneySceneFrame';
import { JourneyTrailOverlay } from '../../components/guidedJourney/JourneyTrailOverlay';

function arrivalSeenKey(userId: string) {
  return `guided-journey-arrival-seen:${userId}`;
}

/** One-time arrival beat — calm interstitial before chapter intro. */
export function JourneyArrivalPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<GuidedJourneyState | null>(null);

  useEffect(() => {
    api<GuidedJourneyState>('/api/guided-journey')
      .then((data) => {
        setState(data);
        if (!data.enabled) return;
        if (!data.enrollment) {
          navigate('/level-up', { replace: true });
          return;
        }
        if (sessionStorage.getItem(arrivalSeenKey(data.userId)) === '1' && data.firstChapterId) {
          navigate(`/level-up/journey/chapter/${data.firstChapterId}`, { replace: true });
        }
      })
      .catch(() => navigate('/level-up', { replace: true }));
  }, [navigate]);

  if (!state?.arrival) {
    return <p className="text-app-text-muted">Loading…</p>;
  }

  function continueOn() {
    if (state?.userId) {
      sessionStorage.setItem(arrivalSeenKey(state.userId), '1');
    }
    if (state?.firstChapterId) {
      navigate(`/level-up/journey/chapter/${state.firstChapterId}`);
    } else {
      navigate('/level-up/journey');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <JourneySceneFrame
        assetId={state.arrival.sceneAssetId}
        variant="immersive"
        stageLabel="Journey arrival"
        panelPlacement="center-low"
        trail={<JourneyTrailOverlay marker="current" />}
      >
        <JourneyOverlayCard className="text-center">
          <p className="text-base font-medium leading-relaxed text-brand-navy dark:text-brand-off-white sm:text-lg">
            {state.arrival.message}
          </p>
          <Button className="mt-5 w-full rounded-full px-6" onClick={continueOn}>
            {state.arrival.ctaLabel}
          </Button>
        </JourneyOverlayCard>
      </JourneySceneFrame>
      <p className="text-center text-xs text-app-text-muted">
        <Link to="/level-up" className="underline-offset-2 hover:underline">
          Return to Level Up
        </Link>
      </p>
    </div>
  );
}
