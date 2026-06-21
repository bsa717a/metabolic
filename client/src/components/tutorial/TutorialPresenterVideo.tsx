import { clsx } from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import {
  getActiveKeyframe,
  PRESENTER_VIDEO_SRC,
  resolvePresenterLayout,
  type PresenterKeyframe
} from './tutorialPresenterTimeline';

type LoadState = 'loading' | 'ready' | 'error';

export function TutorialPresenterVideo({
  onSkip,
  onComplete
}: {
  onSkip: () => void;
  onComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [layout, setLayout] = useState(() => resolvePresenterLayout(getActiveKeyframe(0)));
  const [keyframe, setKeyframe] = useState<PresenterKeyframe>(() => getActiveKeyframe(0));
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  const updateLayout = useCallback((active: PresenterKeyframe) => {
    setKeyframe(active);
    setLayout(resolvePresenterLayout(active));
  }, []);

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    video.volume = 1;
    try {
      await video.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || loadState !== 'ready') return;

    const handleTimeUpdate = () => {
      const active = getActiveKeyframe(video.currentTime);
      updateLayout(active);
    };

    const handleEnded = () => {
      onComplete();
    };

    const handlePlay = () => {
      setPlaybackBlocked(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('play', handlePlay);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('play', handlePlay);
    };
  }, [loadState, onComplete, updateLayout]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    const handleResize = () => updateLayout(getActiveKeyframe(videoRef.current?.currentTime ?? 0));
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [loadState, updateLayout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let ready = false;
    const markReady = () => {
      if (ready) return;
      ready = true;
      setLoadState('ready');
      void startPlayback();
    };

    const tryReady = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) markReady();
    };

    const handleError = () => setLoadState('error');

    video.addEventListener('canplaythrough', tryReady);
    video.addEventListener('loadeddata', tryReady);
    video.addEventListener('error', handleError, { once: true });
    video.load();
    tryReady();

    const timeout = window.setTimeout(() => {
      if (!ready && video.readyState >= HTMLMediaElement.HAVE_METADATA) markReady();
    }, 8_000);

    return () => {
      window.clearTimeout(timeout);
      video.removeEventListener('canplaythrough', tryReady);
      video.removeEventListener('loadeddata', tryReady);
    };
  }, [startPlayback]);

  return (
    <>
      {loadState === 'loading' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-app-bg/95 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-2xl border border-app-border bg-app-surface px-8 py-10 text-center shadow-xl">
            <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-[3px] border-brand-green/25 border-t-brand-green" />
            <h2 className="text-xl font-semibold text-brand-navy dark:text-brand-off-white">Preparing your plan…</h2>
            <p className="mt-2 text-sm text-app-text-muted">Loading your personalized walkthrough.</p>
            <button
              type="button"
              onClick={onSkip}
              className="mt-6 text-sm font-medium text-app-text-muted underline-offset-2 hover:text-brand-navy hover:underline dark:hover:text-brand-off-white"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-app-bg/95 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-2xl border border-app-border bg-app-surface px-8 py-10 text-center shadow-xl">
            <h2 className="text-xl font-semibold text-brand-navy dark:text-brand-off-white">Could not load video</h2>
            <p className="mt-2 text-sm text-app-text-muted">Check your connection and try again, or skip the tour.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button onClick={onSkip}>Skip tour</Button>
            </div>
          </div>
        </div>
      )}

      {loadState === 'ready' && (
        <div className="fixed inset-0 z-[64] pointer-events-auto" aria-hidden />
      )}

      <video
        ref={videoRef}
        className={clsx(
          'fixed z-[65] rounded-2xl bg-black object-contain shadow-2xl ring-2 ring-brand-green/40 transition-all duration-700 ease-in-out',
          loadState !== 'ready' && 'pointer-events-none opacity-0'
        )}
        style={{
          top: layout.top,
          left: layout.left,
          width: layout.width,
          height: layout.height
        }}
        src={PRESENTER_VIDEO_SRC}
        playsInline
        controls
        preload="auto"
        aria-label="Dashboard tutorial video"
      />

      {loadState === 'ready' && playbackBlocked && (
        <div
          className="fixed z-[67] flex items-center justify-center rounded-2xl bg-black/45 backdrop-blur-[1px]"
          style={{
            top: layout.top,
            left: layout.left,
            width: layout.width,
            height: layout.height
          }}
        >
          <Button onClick={() => void startPlayback()}>Start tour</Button>
        </div>
      )}

      {loadState === 'ready' && (
        <div
          className="fixed z-[66] flex items-center gap-2"
          style={{
            top: Math.max(12, layout.top - 44),
            left: layout.left,
            width: layout.width
          }}
        >
          <span className="rounded-full bg-brand-navy/90 px-3 py-1 text-xs font-medium text-brand-off-white dark:bg-brand-green dark:text-brand-navy">
            {keyframe.slot === 'center' ? 'Welcome' : keyframe.slot === 'exercise' ? "Today's exercise" : "Today's nutrition"}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="ml-auto rounded-full bg-app-surface/95 px-3 py-1 text-xs font-semibold text-app-text-muted shadow ring-1 ring-app-border hover:text-brand-navy dark:hover:text-brand-off-white"
          >
            Skip tour
          </button>
        </div>
      )}
    </>
  );
}
