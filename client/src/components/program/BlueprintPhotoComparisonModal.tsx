import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { ChevronLeft, Loader2, Sparkles, X } from 'lucide-react';
import type {
  ProgramMetricSnapshot,
  ProgressPhotoAnalysis,
  ProgressPhotoOverlayShape,
  ProgressPhotoSet
} from '../../types';
import { formatSnapshotDate } from '../../utils/snapshotHistoryUtils';
import type { ProgressPhotoSlot } from '../../services/progressPhotoStorage';
import { firstAndLastSnapshotPhotoSets, photoUrlForSlot } from '../../utils/progressPhotoUtils';
import { detectBeforeAfterOverlays } from '../../utils/progressPhotoPoseDetection';
import { api } from '../../services/api';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { useEntitlements } from '../../context/EntitlementsContext';

const PHOTO_SLOTS: Array<{ slot: ProgressPhotoSlot; label: string }> = [
  { slot: 'front', label: 'Front' },
  { slot: 'side', label: 'Side' },
  { slot: 'back', label: 'Back' }
];

function formatPhotoDate(date: string) {
  return formatSnapshotDate(date);
}

function OverlaySvg({ shapes }: { shapes: ProgressPhotoOverlayShape[] }) {
  if (!shapes.length) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {shapes.map((shape) => {
        if (shape.kind === 'oval') {
          return (
            <g key={shape.id}>
              <ellipse
                cx={shape.cx}
                cy={shape.cy}
                rx={shape.rx}
                ry={shape.ry}
                fill="none"
                stroke="rgba(163, 230, 53, 0.95)"
                strokeWidth={0.007}
              />
              {shape.label ? (
                <text
                  x={Math.min(0.98, shape.cx + shape.rx + 0.015)}
                  y={Math.max(0.04, shape.cy - shape.ry - 0.01)}
                  fill="rgba(248, 250, 252, 0.95)"
                  fontSize="0.035"
                  fontWeight="600"
                  textAnchor="start"
                >
                  {shape.label}
                </text>
              ) : null}
            </g>
          );
        }

        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        if (!start || !end) return null;
        const midY = (start.y + end.y) / 2;
        const rightX = Math.max(start.x, end.x);
        const labelX = Math.min(0.98, rightX + 0.02);
        return (
          <g key={shape.id}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="rgba(163, 230, 53, 0.95)"
              strokeWidth={0.008}
              strokeLinecap="round"
            />
            {shape.label ? (
              <text
                x={labelX}
                y={Math.max(0.04, midY - 0.015)}
                fill="rgba(248, 250, 252, 0.95)"
                fontSize="0.04"
                fontWeight="600"
                textAnchor={labelX > 0.85 ? 'end' : 'start'}
              >
                {shape.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function ComparisonPhoto({
  label,
  date,
  url,
  poseLabel,
  overlayShapes,
  analyzing
}: {
  label: string;
  date: string;
  url: string | null;
  poseLabel: string;
  overlayShapes?: ProgressPhotoOverlayShape[];
  analyzing?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">{label}</p>
        <p className="text-xs text-app-text-muted">{formatPhotoDate(date)}</p>
      </div>
      {url ? (
        <div className="relative w-full overflow-hidden rounded-2xl bg-app-muted/40">
          {/* Natural image box so overlay coords map 1:1 to the visible photo (no object-cover crop). */}
          <img
            src={url}
            alt={`${label} ${poseLabel.toLowerCase()} progress`}
            className="block h-auto w-full"
          />
          {overlayShapes?.length ? <OverlaySvg shapes={overlayShapes} /> : null}
          {analyzing ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-green drop-shadow" />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-muted/50 px-4 text-center text-sm text-app-text-muted">
          No {poseLabel.toLowerCase()} photo
        </div>
      )}
    </div>
  );
}

function CoachAnalysisPanel({
  analysis,
  loading,
  error,
  onClose
}: {
  analysis: ProgressPhotoAnalysis | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const coach = getVirtualCoach(analysis?.coachId) ?? getVirtualCoach('nora');

  return (
    <div className="shrink-0 border-t border-app-border bg-app-surface px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {coach ? (
            <img
              src={coach.image}
              alt={coach.name}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-brand-green/40"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-bold text-app-text">{coach?.name ?? 'Coach'}</p>
            <p className="text-xs text-app-text-muted">What changed in this pose</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-full p-1.5 text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
          onClick={onClose}
          aria-label="Close coach analysis"
        >
          <X size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-app-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Looking at your photos with pose detection…
        </div>
      ) : error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : analysis ? (
        <p className="max-h-36 overflow-y-auto text-sm leading-relaxed text-app-text">{analysis.message}</p>
      ) : null}
    </div>
  );
}

function overlayShapesFor(
  analysis: ProgressPhotoAnalysis | null | undefined,
  side: 'before' | 'after'
): ProgressPhotoOverlayShape[] | undefined {
  if (!analysis) return undefined;
  const sideOverlays = analysis.overlays[side];
  if (sideOverlays.shapes?.length) return sideOverlays.shapes;
  if (sideOverlays.lines?.length) {
    return sideOverlays.lines.map((line) => ({ kind: 'line' as const, ...line }));
  }
  return undefined;
}

export function BlueprintPhotoComparisonModal({
  open,
  programId,
  snapshots,
  progressPhotos,
  onClose
}: {
  open: boolean;
  programId: string;
  snapshots: ProgramMetricSnapshot[];
  progressPhotos: ProgressPhotoSet[];
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const analysisGenerationRef = useRef(0);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [analysisByPose, setAnalysisByPose] = useState<Partial<Record<ProgressPhotoSlot, ProgressPhotoAnalysis>>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingPose, setAnalyzingPose] = useState<ProgressPhotoSlot | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const { canAccess } = useEntitlements();

  const comparison = useMemo(
    () => firstAndLastSnapshotPhotoSets(snapshots, progressPhotos),
    [snapshots, progressPhotos]
  );
  const sameSession = comparison?.first.id === comparison?.last.id;
  const activeSlot = PHOTO_SLOTS[activeSlotIndex]?.slot ?? 'front';
  const activePoseLabel = PHOTO_SLOTS[activeSlotIndex]?.label ?? 'Front';
  // Keep the sheet tied to the pose being analyzed so swiping mid-request doesn't blank it.
  const sheetPose = analyzingPose ?? activeSlot;
  const sheetAnalysis = analysisByPose[sheetPose] ?? null;
  const canUseAi = canAccess('limited_ai_coach') || canAccess('extended_ai_coach');
  // Prefer the program owner's coach from analysis; avoid labeling with the viewer's coach.
  const coach = getVirtualCoach(sheetAnalysis?.coachId);

  const activePoseReady = Boolean(
    comparison &&
      !sameSession &&
      photoUrlForSlot(comparison.first, activeSlot) &&
      photoUrlForSlot(comparison.last, activeSlot)
  );

  useEffect(() => {
    if (!open) {
      analysisGenerationRef.current += 1;
      setActiveSlotIndex(0);
      setAnalysisByPose({});
      setSheetOpen(false);
      setAnalyzing(false);
      setAnalyzingPose(null);
      setAnalysisError('');
      // Reset while closed so reopen doesn't flash the previous pose under the Front tab.
      const container = scrollRef.current;
      if (container) container.scrollLeft = 0;
      return;
    }

    const container = scrollRef.current;
    if (container) container.scrollLeft = 0;
    setActiveSlotIndex(0);
  }, [open]);

  function scrollToSlot(index: number) {
    const container = scrollRef.current;
    if (!container) return;
    const width = container.clientWidth;
    container.scrollTo({ left: width * index, behavior: 'smooth' });
    setActiveSlotIndex(index);
    if (!analyzing) {
      setSheetOpen(false);
      setAnalysisError('');
    }
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container || container.clientWidth === 0) return;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    const next = Math.min(Math.max(index, 0), PHOTO_SLOTS.length - 1);
    if (next !== activeSlotIndex) {
      setActiveSlotIndex(next);
      if (!analyzing) {
        setSheetOpen(false);
        setAnalysisError('');
      }
    }
  }

  async function runCoachAnalysis() {
    if (!activePoseReady || analyzing || !canUseAi || !comparison) return;

    const pose = activeSlot;
    const cached = analysisByPose[pose];
    if (cached) {
      setAnalysisError('');
      setAnalyzingPose(null);
      setSheetOpen(true);
      return;
    }

    const beforeUrl = photoUrlForSlot(comparison.first, pose);
    const afterUrl = photoUrlForSlot(comparison.last, pose);
    if (!beforeUrl || !afterUrl) return;

    const generation = analysisGenerationRef.current;
    setAnalyzing(true);
    setAnalyzingPose(pose);
    setAnalysisError('');
    setSheetOpen(true);

    try {
      // MediaPipe measures landmarks in-browser; Gemini only writes coach copy.
      const measured = await detectBeforeAfterOverlays(programId, beforeUrl, afterUrl);
      if (generation !== analysisGenerationRef.current) return;

      const landmarkSummary = [
        `Before: ${measured.before.summary}`,
        `After: ${measured.after.summary}`
      ].join('\n');

      const result = await api<ProgressPhotoAnalysis>('/api/ai/progress-photo-analysis', {
        method: 'POST',
        body: JSON.stringify({ programId, pose, landmarkSummary })
      });
      if (generation !== analysisGenerationRef.current) return;

      setAnalysisByPose((current) => ({
        ...current,
        [pose]: {
          ...result,
          overlays: {
            before: { lines: measured.before.lines, shapes: measured.before.shapes },
            after: { lines: measured.after.lines, shapes: measured.after.shapes }
          }
        }
      }));
    } catch (error) {
      if (generation !== analysisGenerationRef.current) return;
      setAnalysisError(error instanceof Error ? error.message : 'Could not analyze these photos.');
    } finally {
      if (generation === analysisGenerationRef.current) {
        setAnalyzing(false);
        setAnalyzingPose(null);
      }
    }
  }

  return createPortal(
    <div className={clsx('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={clsx('absolute inset-0 bg-slate-950/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 top-0 flex flex-col overflow-hidden bg-app-bg transition-[transform,height] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(640px,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:shadow-2xl',
          sheetOpen ? 'sm:h-[min(920px,96vh)]' : 'sm:h-[min(760px,92vh)]',
          open ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(-50%+100vh)]'
        )}
      >
        <div className="shrink-0 bg-brand-navy px-5 pb-4 pt-4 text-brand-off-white">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green-light"
              onClick={onClose}
            >
              <ChevronLeft size={16} />
              Close
            </button>
            {comparison && !sameSession && canUseAi ? (
              <button
                type="button"
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  activePoseReady && !analyzing
                    ? 'bg-brand-green text-brand-navy hover:bg-brand-green-light'
                    : 'cursor-not-allowed bg-white/10 text-brand-off-white/50'
                )}
                disabled={!activePoseReady || analyzing}
                onClick={() => void runCoachAnalysis()}
                title={
                  activePoseReady
                    ? `Ask ${coach?.name ?? 'your coach'} what changed`
                    : `Add a ${activePoseLabel.toLowerCase()} photo on both check-ins first`
                }
              >
                {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Ask {coach?.name ?? sheetAnalysis?.coachId ?? 'coach'}
              </button>
            ) : null}
          </div>
          <h2 className="mt-3 text-base font-bold uppercase tracking-wide">Comparison</h2>
          <p className="mt-1 text-xs font-semibold text-brand-green-light">
            {comparison ? 'Your first and most recent progress photos' : 'No progress photos yet'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!comparison ? (
            <p className="rounded-2xl border border-dashed border-app-border px-4 py-10 text-center text-sm text-app-text-muted">
              Upload progress photos during a check-in to compare your transformation over time.
            </p>
          ) : (
            <div className="space-y-4">
              {sameSession ? (
                <p className="text-sm text-app-text-muted">
                  You have one photo session so far. Add more check-in photos to see before and after side by side.
                </p>
              ) : null}

              <div className="flex justify-center gap-2">
                {PHOTO_SLOTS.map(({ slot, label }, index) => (
                  <button
                    key={slot}
                    type="button"
                    className={clsx(
                      'rounded-full px-4 py-1.5 text-sm font-semibold transition',
                      activeSlotIndex === index
                        ? 'bg-brand-navy text-brand-off-white dark:bg-brand-green dark:text-brand-navy'
                        : 'bg-app-muted text-app-text-muted hover:text-app-text'
                    )}
                    onClick={() => scrollToSlot(index)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                ref={scrollRef}
                className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onScroll={handleScroll}
              >
                {PHOTO_SLOTS.map(({ slot, label }) => {
                  const poseAnalysis = analysisByPose[slot];
                  const showOverlays = Boolean(poseAnalysis);
                  return (
                    <div key={slot} className="w-full shrink-0 snap-center">
                      <div className="flex gap-4">
                        <ComparisonPhoto
                          label="Before"
                          date={comparison.first.date}
                          url={photoUrlForSlot(comparison.first, slot)}
                          poseLabel={label}
                          overlayShapes={showOverlays ? overlayShapesFor(poseAnalysis, 'before') : undefined}
                          analyzing={analyzing && analyzingPose === slot}
                        />
                        <ComparisonPhoto
                          label="After"
                          date={comparison.last.date}
                          url={photoUrlForSlot(comparison.last, slot)}
                          poseLabel={label}
                          overlayShapes={showOverlays ? overlayShapesFor(poseAnalysis, 'after') : undefined}
                          analyzing={analyzing && analyzingPose === slot}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-center text-xs text-app-text-muted">
                Swipe or tap Front, Side, or Back to compare each pose
              </p>
            </div>
          )}
        </div>

        {sheetOpen ? (
          <CoachAnalysisPanel
            analysis={sheetAnalysis}
            loading={analyzing && !sheetAnalysis}
            error={analysisError}
            onClose={() => setSheetOpen(false)}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
