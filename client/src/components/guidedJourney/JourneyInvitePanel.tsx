import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import type { GuidedJourneyState } from '../../types/guidedJourney';
import { Button } from '../ui/Button';
import { JourneyOverlayCard } from './JourneyOverlayCard';
import { JourneySceneFrame } from './JourneySceneFrame';

export function JourneyInvitePanel({
  onEnabledChange
}: {
  onEnabledChange?: (enabled: boolean) => void;
} = {}) {
  const navigate = useNavigate();
  const [state, setState] = useState<GuidedJourneyState | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api<GuidedJourneyState>('/api/guided-journey')
      .then((data) => {
        setState(data);
        onEnabledChange?.(data.enabled);
        if (data.enabled && !data.enrollment) {
          void api('/api/guided-journey/invitation-viewed', { method: 'POST' }).catch(() => undefined);
        }
      })
      .catch(() => {
        setState(null);
        onEnabledChange?.(false);
      });
  }, [onEnabledChange]);

  if (!state?.enabled) return null;

  /** Level Up teaser only — trail markers appear inside /level-up/journey/*. */
  const world = (assetId: string, stageLabel: string, panel: ReactNode) => (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      <JourneySceneFrame
        assetId={assetId}
        variant="invite"
        stageLabel={stageLabel}
        panelPlacement="trailhead"
        className="rounded-none sm:rounded-[1.75rem] sm:mx-6 lg:mx-8"
      >
        {panel}
      </JourneySceneFrame>
    </div>
  );

  if (state.enrollment) {
    const discovery = state.activeDiscovery;
    const title = discovery?.content?.discovery.title;
    const living = discovery?.content?.discovery.experienceLivingCopy;
    const status = discovery?.progress?.status;
    const href = discovery?.progress?.discoveryId
      ? `/level-up/journey/discovery/${discovery.progress.discoveryId}`
      : state.firstChapterId
        ? `/level-up/journey/chapter/${state.firstChapterId}`
        : '/level-up/journey';

    return (
      <section aria-label="Active guided journey">
        {world(
          discovery?.content?.discovery.sceneAssetIds.experiencing ?? state.invite.sceneAssetId,
          'Active journey',
          <JourneyOverlayCard>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-green">
              On the trail
            </p>
            <h2 className="mt-1.5 text-lg font-bold leading-snug text-brand-navy dark:text-brand-off-white sm:text-xl">
              {title ?? 'Continue when you are ready'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-app-text-muted">
              {status === 'EXPERIENCING' || status === 'REFLECTION_UNLOCKED'
                ? (living ?? 'Stay with today’s experiment.')
                : state.enrollment.status === 'PAUSED'
                  ? 'Paused — your progress is saved.'
                  : 'Step back onto the path when you are ready.'}
            </p>
            <Link to={href} className="mt-4 block">
              <Button className="w-full rounded-full px-6">Open Journey</Button>
            </Link>
          </JourneyOverlayCard>
        )}
      </section>
    );
  }

  async function begin() {
    setStarting(true);
    try {
      const next = await api<GuidedJourneyState>('/api/guided-journey/start', { method: 'POST' });
      setState(next);
      navigate('/level-up/journey/arrival');
    } finally {
      setStarting(false);
    }
  }

  return (
    <section aria-label="Guided journey invitation">
      {world(
        state.invite.sceneAssetId,
        'Journey invitation',
        <JourneyOverlayCard>
          <h2 className="text-lg font-bold leading-snug text-brand-navy dark:text-brand-off-white sm:text-xl">
            {state.invite.headline}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-app-text-muted">{state.invite.body}</p>
          <Button
            className="mt-4 w-full rounded-full px-6"
            disabled={starting}
            onClick={() => void begin()}
          >
            {starting ? 'Starting…' : state.invite.ctaLabel}
          </Button>
        </JourneyOverlayCard>
      )}
    </section>
  );
}
