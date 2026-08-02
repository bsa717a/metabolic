import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../services/api';
import type { ChapterState } from '../../types/guidedJourney';
import { Button } from '../../components/ui/Button';
import { JourneyOverlayCard } from '../../components/guidedJourney/JourneyOverlayCard';
import { JourneyPillarMarks } from '../../components/guidedJourney/JourneyPillarMarks';
import { JourneySceneFrame } from '../../components/guidedJourney/JourneySceneFrame';
import { JourneyTrailOverlay } from '../../components/guidedJourney/JourneyTrailOverlay';

export function JourneyChapterIntroPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ChapterState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chapterId) return;
    api<ChapterState>(`/api/guided-journey/chapters/${chapterId}`)
      .then(setData)
      .catch(() => setError('Unable to load this chapter.'));
  }, [chapterId]);

  if (error) {
    return <p className="text-app-text-muted">{error}</p>;
  }
  if (!data) {
    return <p className="text-app-text-muted">Loading chapter…</p>;
  }

  const { chapter, firstDiscovery } = data;

  async function beginDiscovery() {
    if (!firstDiscovery || !data) return;
    setBusy(true);
    try {
      if (!data.enrollmentStatus) {
        await api('/api/guided-journey/start', { method: 'POST' });
      }
      await api(`/api/guided-journey/discoveries/${firstDiscovery.id}/begin`, { method: 'POST' });
      navigate(`/level-up/journey/discovery/${firstDiscovery.id}`);
    } catch {
      setError('Could not begin discovery.');
    } finally {
      setBusy(false);
    }
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
        assetId={chapter.sceneAssetId}
        variant="panorama"
        stageLabel={`${chapter.subtitle}: ${chapter.title}`}
        panelPlacement="trailhead-tall"
        trail={<JourneyTrailOverlay marker="current" />}
      >
        <JourneyOverlayCard
          tone="mist"
          className="flex h-full flex-col overflow-y-auto overscroll-contain p-5 sm:p-6"
        >
          <div className="min-h-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-green">
              {chapter.subtitle}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-brand-navy dark:text-brand-off-white sm:text-3xl">
              {chapter.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-app-text-muted sm:text-[15px] lg:text-brand-navy/90 dark:lg:text-brand-off-white/90">
              {chapter.description}
            </p>

            <JourneyPillarMarks pillars={chapter.pillars} className="mt-6" />

            {firstDiscovery && (
              <p className="mt-6 text-sm text-app-text lg:text-brand-navy dark:lg:text-brand-off-white/85">
                Today’s discovery:{' '}
                <span className="font-semibold text-brand-navy dark:text-brand-off-white">
                  {firstDiscovery.title}
                </span>
              </p>
            )}
          </div>

          <Button
            className="mt-6 w-full shrink-0 rounded-full px-6"
            disabled={busy || !firstDiscovery}
            onClick={() => void beginDiscovery()}
          >
            {busy ? 'Starting…' : chapter.beginDiscoveryCtaLabel}
          </Button>
        </JourneyOverlayCard>
      </JourneySceneFrame>
    </div>
  );
}
