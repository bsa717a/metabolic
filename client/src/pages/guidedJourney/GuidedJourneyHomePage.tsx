import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { notifyGuidedJourneyUpdated } from '../../lib/guidedJourneyEvents';
import { api } from '../../services/api';
import type { GuidedJourneyState } from '../../types/guidedJourney';
import { Button } from '../../components/ui/Button';
import { JourneyOverlayCard } from '../../components/guidedJourney/JourneyOverlayCard';
import { JourneySceneFrame } from '../../components/guidedJourney/JourneySceneFrame';
import { JourneyTrailOverlay } from '../../components/guidedJourney/JourneyTrailOverlay';
import { JourneyTrailMarker } from '../../components/guidedJourney/JourneyTrailOverlay';

export function GuidedJourneyHomePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<GuidedJourneyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<GuidedJourneyState>('/api/guided-journey')
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-app-text-muted">Loading your Journey…</p>;
  if (!state?.enabled) {
    return (
      <div className="space-y-4">
        <Link to="/level-up" className="inline-flex items-center gap-1 text-sm text-app-text-muted">
          <ArrowLeft size={16} /> Level Up
        </Link>
        <p className="text-app-text-muted">Guided Journey is not available right now.</p>
      </div>
    );
  }

  const activeId = state.enrollment?.currentDiscoveryId;
  const sceneId =
    state.activeDiscovery?.content?.discovery.sceneAssetIds.experiencing ??
    state.invite.sceneAssetId;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/level-up"
        className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text"
      >
        <ArrowLeft size={16} /> Level Up
      </Link>

      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      <JourneySceneFrame
        assetId={sceneId}
        variant="panorama"
        stageLabel="Your Journey"
        panelPlacement="trailhead"
        className="rounded-none sm:rounded-[1.75rem] sm:mx-6 lg:mx-8"
        trail={
          <JourneyTrailOverlay
            marker={state.enrollment ? 'current' : 'locked'}
            showWisdomStone={state.wisdomStones.length > 0}
          />
        }
      >
        <JourneyOverlayCard>
          <h1 className="text-xl font-bold text-brand-navy dark:text-brand-off-white sm:text-2xl">
            Your Journey
          </h1>
          <p className="mt-2 text-sm text-app-text-muted">
            {state.enrollment
              ? state.enrollment.status === 'PAUSED'
                ? 'Paused — your progress is saved.'
                : 'One discovery at a time along the trail.'
              : state.invite.headline}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {state.enrollment?.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() =>
                  void api('/api/guided-journey/pause', { method: 'POST' }).then(() => {
                    notifyGuidedJourneyUpdated();
                    load();
                  })
                }
              >
                Pause
              </Button>
            )}
            {state.enrollment?.status === 'PAUSED' && (
              <Button
                className="rounded-full px-6"
                onClick={() =>
                  void api('/api/guided-journey/resume', { method: 'POST' }).then(() => {
                    notifyGuidedJourneyUpdated();
                    load();
                  })
                }
              >
                Resume
              </Button>
            )}
            {!state.enrollment && (
              <Button
                className="rounded-full px-6"
                disabled={starting}
                onClick={() => {
                  setStarting(true);
                  void api('/api/guided-journey/start', { method: 'POST' })
                    .then(() => {
                      notifyGuidedJourneyUpdated();
                      navigate('/level-up/journey/arrival');
                    })
                    .finally(() => setStarting(false));
                }}
              >
                {starting ? 'Starting…' : state.invite.ctaLabel}
              </Button>
            )}
            {state.enrollment && !activeId && state.firstChapterId && (
              <Link to={`/level-up/journey/chapter/${state.firstChapterId}`}>
                <Button className="rounded-full px-6">Continue</Button>
              </Link>
            )}
            {activeId && (
              <Link to={`/level-up/journey/discovery/${activeId}`}>
                <Button className="rounded-full px-6">Open discovery</Button>
              </Link>
            )}
          </div>
        </JourneyOverlayCard>
      </JourneySceneFrame>
      </div>

      <JourneyOverlayCard>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted">Trail</h2>
        <ol className="mt-4 space-y-4">
          {state.trail.map((stop, index) => {
            const isCurrent = stop.discoveryId === activeId && !stop.completed;
            const marker = stop.completed ? 'complete' : isCurrent ? 'current' : 'locked';
            const statusLabel = stop.completed
              ? 'Completed'
              : isCurrent
                ? 'Current'
                : stop.status
                  ? 'In progress'
                  : 'Locked';
            return (
              <li key={stop.discoveryId} className="flex items-center gap-3">
                <JourneyTrailMarker state={marker} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-app-text">
                    {index + 1}. {stop.title}
                  </p>
                  <p className="text-xs text-app-text-muted">{statusLabel}</p>
                </div>
                {(isCurrent || stop.completed) && (
                  <Link
                    to={`/level-up/journey/discovery/${stop.discoveryId}`}
                    className="text-sm font-semibold text-brand-green"
                  >
                    Open
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </JourneyOverlayCard>

      {state.skills.length > 0 && (
        <JourneyOverlayCard>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted">
            Skills earned
          </h2>
          <ul className="mt-3 space-y-3">
            {state.skills.map((skill) => (
              <li key={skill.skillId} className="flex items-start gap-3">
                <span
                  className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] border-brand-gold bg-brand-green/15"
                  aria-hidden
                >
                  <span className="h-4 w-4 rounded-full bg-brand-green/60" />
                </span>
                <div>
                  <p className="font-semibold">{skill.title}</p>
                  <p className="text-sm text-app-text-muted">{skill.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </JourneyOverlayCard>
      )}

      {state.wisdomStones.length > 0 && (
        <JourneyOverlayCard>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-app-text-muted">
            Wisdom stones
          </h2>
          <ul className="mt-3 space-y-3">
            {state.wisdomStones.map((stone) => (
              <li
                key={stone.id}
                className="flex gap-3 rounded-2xl border border-app-border bg-app-muted/40 p-3"
              >
                <span
                  className="mt-0.5 h-10 w-10 shrink-0 rounded-[40%_40%_45%_45%] bg-gradient-to-b from-stone-400 to-stone-600 ring-2 ring-brand-gold/40"
                  aria-hidden
                />
                <div>
                  <p className="text-sm text-app-text">{stone.reflectionText}</p>
                  <p className="mt-1 text-xs text-app-text-muted">
                    {new Date(stone.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </JourneyOverlayCard>
      )}
    </div>
  );
}
