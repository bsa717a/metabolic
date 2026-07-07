import { useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import type { ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { formatSnapshotDate } from '../../utils/snapshotHistoryUtils';
import type { ProgressPhotoSlot } from '../../services/progressPhotoStorage';
import { firstAndLastSnapshotPhotoSets, photoUrlForSlot } from '../../utils/progressPhotoUtils';

const PHOTO_SLOTS: Array<{ slot: ProgressPhotoSlot; label: string }> = [
  { slot: 'front', label: 'Front' },
  { slot: 'side', label: 'Side' },
  { slot: 'back', label: 'Back' }
];

function formatPhotoDate(date: string) {
  return formatSnapshotDate(date);
}

function ComparisonPhoto({
  label,
  date,
  url,
  poseLabel
}: {
  label: string;
  date: string;
  url: string | null;
  poseLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">{label}</p>
        <p className="text-xs text-app-text-muted">{formatPhotoDate(date)}</p>
      </div>
      {url ? (
        <img
          src={url}
          alt={`${label} ${poseLabel.toLowerCase()} progress`}
          className="aspect-[3/4] w-full rounded-2xl object-cover"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-muted/50 px-4 text-center text-sm text-app-text-muted">
          No {poseLabel.toLowerCase()} photo
        </div>
      )}
    </div>
  );
}

export function BlueprintPhotoComparisonModal({
  open,
  snapshots,
  progressPhotos,
  onClose
}: {
  open: boolean;
  snapshots: ProgramMetricSnapshot[];
  progressPhotos: ProgressPhotoSet[];
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);

  const comparison = useMemo(
    () => firstAndLastSnapshotPhotoSets(snapshots, progressPhotos),
    [snapshots, progressPhotos]
  );
  const sameSession = comparison?.first.id === comparison?.last.id;

  function scrollToSlot(index: number) {
    const container = scrollRef.current;
    if (!container) return;
    const width = container.clientWidth;
    container.scrollTo({ left: width * index, behavior: 'smooth' });
    setActiveSlotIndex(index);
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container || container.clientWidth === 0) return;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    setActiveSlotIndex(Math.min(Math.max(index, 0), PHOTO_SLOTS.length - 1));
  }

  return createPortal(
    <div className={clsx('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={clsx('absolute inset-0 bg-slate-950/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 top-0 flex flex-col bg-app-bg transition-transform sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(760px,92vh)] sm:w-[min(640px,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl',
          open ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(-50%+100vh)]'
        )}
      >
        <div className="shrink-0 bg-brand-navy px-5 pb-4 pt-4 text-brand-off-white">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green-light"
            onClick={onClose}
          >
            <ChevronLeft size={16} />
            Close
          </button>
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
                {PHOTO_SLOTS.map(({ slot, label }) => (
                  <div key={slot} className="w-full shrink-0 snap-center">
                    <div className="flex gap-4">
                      <ComparisonPhoto
                        label="Before"
                        date={comparison.first.date}
                        url={photoUrlForSlot(comparison.first, slot)}
                        poseLabel={label}
                      />
                      <ComparisonPhoto
                        label="After"
                        date={comparison.last.date}
                        url={photoUrlForSlot(comparison.last, slot)}
                        poseLabel={label}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-center text-xs text-app-text-muted">Swipe or tap Front, Side, or Back to compare each pose</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
