import { clsx } from 'clsx';

export type TrailMarkerState = 'locked' | 'current' | 'complete';

/** HTML/CSS trail markers only — no SVG. */
export function JourneyTrailMarker({
  state,
  size
}: {
  state: TrailMarkerState;
  size: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-11 w-11' : size === 'md' ? 'h-8 w-8' : 'h-6 w-6';
  const ring =
    state === 'current'
      ? 'border-[3px] border-brand-gold bg-brand-gold/30 shadow-[0_0_0_6px_rgba(226,194,110,0.25)]'
      : state === 'complete'
        ? 'border-0 bg-brand-gold'
        : 'border-2 border-white/70 bg-black/25';

  return (
    <span className={clsx('relative grid place-items-center rounded-full', dim, ring)}>
      {state === 'complete' && (
        <span className="absolute inset-[28%] rounded-full bg-brand-navy/20 dark:bg-brand-off-white/30" />
      )}
      {state === 'current' && (
        <span className="h-2.5 w-2.5 rounded-full bg-brand-gold shadow-sm" />
      )}
    </span>
  );
}

export function JourneyTrailOverlay({
  marker = 'current',
  showWisdomStone = false,
  className
}: {
  marker?: TrailMarkerState;
  showWisdomStone?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx('pointer-events-none absolute inset-0', className)} aria-hidden>
      <div className="absolute bottom-[11%] left-[26%] sm:left-[28%] lg:left-[29%]">
        <JourneyTrailMarker state={marker} size="lg" />
        {showWisdomStone && (
          <span className="mx-auto mt-2 block h-8 w-8 rounded-[40%_40%_45%_45%] bg-gradient-to-b from-stone-400 to-stone-600 shadow-md ring-2 ring-brand-gold/40" />
        )}
      </div>

      <div className="absolute bottom-[36%] left-[40%] sm:left-[42%]">
        <JourneyTrailMarker state={marker === 'complete' ? 'complete' : 'locked'} size="md" />
      </div>

      <div className="absolute bottom-[56%] left-[51%] sm:left-[53%]">
        <JourneyTrailMarker state="locked" size="sm" />
      </div>
    </div>
  );
}
