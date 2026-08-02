import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../services/api';
import type { DiscoveryStateResponse } from '../../types/guidedJourney';
import { Button } from '../../components/ui/Button';
import { JourneyCoachAvatar } from '../../components/guidedJourney/JourneyCoachAvatar';
import { JourneyOverlayCard } from '../../components/guidedJourney/JourneyOverlayCard';
import { JourneySceneFrame } from '../../components/guidedJourney/JourneySceneFrame';
import { JourneySkillMoment } from '../../components/guidedJourney/JourneySkillMoment';
import { JourneyTrailOverlay } from '../../components/guidedJourney/JourneyTrailOverlay';

function relativeSince(iso: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'Started less than an hour ago';
  if (hours === 1) return 'Living with this for about an hour';
  if (hours < 24) return `Living with this for about ${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Living with this since yesterday' : `Living with this for ${days} days`;
}

export function JourneyDiscoveryPage() {
  const { discoveryId } = useParams<{ discoveryId: string }>();
  const [data, setData] = useState<DiscoveryStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState('');

  const load = useCallback(async () => {
    if (!discoveryId) return;
    try {
      const next = await api<DiscoveryStateResponse>(`/api/guided-journey/discoveries/${discoveryId}`);
      setData(next);
      if (next.progress?.reflectionText) setReflection(next.progress.reflectionText);
    } catch {
      setError('Unable to load this discovery.');
    }
  }, [discoveryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sceneAssetId = useMemo(() => {
    if (!data) return 'l1-valley-intro';
    const status = data.progress?.status;
    const ids = data.content.discovery.sceneAssetIds;
    if (status === 'COMPLETED') return 'l1-valley-celebrate';
    if (status === 'REFLECTION_UNLOCKED') return ids.reflection;
    if (status === 'EXPERIENCING') return ids.experiencing;
    return ids.discover;
  }, [data]);

  const trailMarker = useMemo(() => {
    const status = data?.progress?.status;
    if (status === 'COMPLETED') return 'complete' as const;
    if (status === 'EXPERIENCING' || status === 'REFLECTION_UNLOCKED') return 'current' as const;
    return 'locked' as const;
  }, [data?.progress?.status]);

  if (error) return <p className="text-app-text-muted">{error}</p>;
  if (!data) return <p className="text-app-text-muted">Loading discovery…</p>;

  const { content, progress } = data;
  const discovery = content.discovery;
  const status = progress?.status ?? 'INTRODUCED';
  const stageLabel =
    status === 'COMPLETED'
      ? 'Celebration'
      : status === 'REFLECTION_UNLOCKED'
        ? 'Reflect'
        : status === 'EXPERIENCING'
          ? 'Experience'
          : 'Discover';

  async function noticeToday() {
    if (!discoveryId) return;
    setBusy(true);
    try {
      if (!progress) {
        await api(`/api/guided-journey/discoveries/${discoveryId}/begin`, { method: 'POST' });
      }
      const next = await api<DiscoveryStateResponse>(
        `/api/guided-journey/discoveries/${discoveryId}/experience`,
        { method: 'POST' }
      );
      setData(next);
    } catch {
      setError('Could not start the experience.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReflection() {
    if (!discoveryId) return;
    setBusy(true);
    try {
      const next = await api<DiscoveryStateResponse>(
        `/api/guided-journey/discoveries/${discoveryId}/reflect`,
        { method: 'POST', body: JSON.stringify({ reflectionText: reflection }) }
      );
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save reflection.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleReminders() {
    if (!data) return;
    const enabled = !data.remindersEnabled;
    await api('/api/guided-journey/reminders', {
      method: 'PATCH',
      body: JSON.stringify({ enabled })
    });
    setData({ ...data, remindersEnabled: enabled });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        to="/level-up/journey"
        className="inline-flex items-center gap-1 text-sm text-app-text-muted hover:text-app-text"
      >
        <ArrowLeft size={16} /> Journey
      </Link>

      <JourneySceneFrame
        assetId={sceneAssetId}
        variant="immersive"
        stageLabel={`${discovery.title} — ${stageLabel}`}
        panelPlacement="trailhead"
        trail={
          <JourneyTrailOverlay
            marker={trailMarker}
            showWisdomStone={status === 'COMPLETED' || status === 'REFLECTION_UNLOCKED'}
          />
        }
      >
        <JourneyOverlayCard>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-green">
                {content.chapter?.subtitle ?? 'Journey'} · {stageLabel}
              </p>
              <h1 className="mt-1 text-xl font-bold text-brand-navy dark:text-brand-off-white">
                {discovery.title}
              </h1>
              {content.chapter && (
                <p className="mt-1 text-sm text-app-text-muted">{content.chapter.title}</p>
              )}
            </div>
            <JourneyCoachAvatar coachId={data.selectedVirtualCoachId} size="sm" />
          </div>
        </JourneyOverlayCard>
      </JourneySceneFrame>

      {status === 'INTRODUCED' && (
        <JourneyOverlayCard className="space-y-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-app-text">
            {discovery.introductionContent}
          </p>
          <Button className="w-full rounded-full px-6 sm:w-auto" disabled={busy} onClick={() => void noticeToday()}>
            {busy ? 'Starting…' : discovery.discoverCtaLabel}
          </Button>
        </JourneyOverlayCard>
      )}

      {(status === 'EXPERIENCING' || status === 'REFLECTION_UNLOCKED') && (
        <JourneyOverlayCard className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-text-muted">
            Today’s experiment
          </p>
          <p className="text-base font-medium text-brand-navy dark:text-brand-off-white">
            {discovery.experienceLivingCopy}
          </p>
          <p className="text-sm text-app-text-muted whitespace-pre-line">
            {discovery.experienceInstructions}
          </p>

          <div
            className="rounded-2xl border border-brand-green/25 bg-brand-green/5 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-app-text">You are in the experience</p>
            <p className="mt-0.5 text-xs text-app-text-muted">
              {relativeSince(progress?.experienceStartedAt ?? null) ?? 'Sit with this today.'}
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm text-app-text">
            <span>Remind me gently</span>
            <input
              type="checkbox"
              className="h-5 w-9 accent-brand-green"
              checked={data.remindersEnabled}
              onChange={() => void toggleReminders()}
            />
          </label>

          {status === 'EXPERIENCING' && !progress?.reflectionAvailable && (
            <p className="rounded-2xl border border-dashed border-app-border bg-app-muted/40 px-3 py-2 text-sm text-app-text-muted">
              Reflection opens when you have lived with this for a while. No countdown.
            </p>
          )}

          {(status === 'REFLECTION_UNLOCKED' ||
            (status === 'EXPERIENCING' && progress?.reflectionAvailable)) && (
            <div className="space-y-3 border-t border-app-border pt-4">
              <label className="block text-sm font-semibold text-app-text" htmlFor="gj-reflection">
                {discovery.reflectionQuestion}
              </label>
              <textarea
                id="gj-reflection"
                className="min-h-[120px] w-full rounded-2xl border border-app-border bg-app-muted/30 px-3 py-2 text-sm text-app-text outline-none focus:ring-2 focus:ring-brand-green/40"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                maxLength={4000}
              />
              <Button
                className="w-full rounded-full px-6 sm:w-auto"
                disabled={busy || !reflection.trim()}
                onClick={() => void submitReflection()}
              >
                {busy ? 'Saving…' : 'Share what I noticed'}
              </Button>
            </div>
          )}
        </JourneyOverlayCard>
      )}

      {status === 'COMPLETED' && (
        <div className="space-y-4">
          {progress?.coachResponse && (
            <JourneyOverlayCard className="space-y-3">
              <div className="flex items-start gap-3">
                <JourneyCoachAvatar coachId={data.selectedVirtualCoachId} size="md" />
                <div className="min-w-0 flex-1 rounded-2xl border border-app-border bg-app-muted/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                    Your guide
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-app-text">{progress.coachResponse}</p>
                </div>
              </div>
              {progress.reflectionText && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                    What you noticed
                  </p>
                  <p className="mt-1 text-sm text-app-text whitespace-pre-line">{progress.reflectionText}</p>
                </div>
              )}
            </JourneyOverlayCard>
          )}

          {content.skill && data.skillEarned && (
            <JourneySkillMoment
              title={content.skill.title}
              description={content.skill.description}
              skillAssetId={content.skill.skillAssetId}
            />
          )}

          <JourneyOverlayCard className="flex items-center gap-3">
            <span
              className="h-12 w-12 shrink-0 rounded-[40%_40%_45%_45%] bg-gradient-to-b from-stone-400 to-stone-600 shadow-md ring-2 ring-brand-gold/40"
              aria-hidden
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold">Wisdom stone</p>
              <p className="text-sm text-app-text-muted">Your reflection is saved on the trail.</p>
            </div>
          </JourneyOverlayCard>

          <Link to="/level-up/journey" className="block">
            <Button className="w-full rounded-full px-6">Continue your Journey</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
