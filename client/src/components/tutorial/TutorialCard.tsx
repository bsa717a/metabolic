import { clsx } from 'clsx';
import { Button } from '../ui/Button';
import type { DashboardTutorialStep } from './dashboardTutorialSteps';
import { DASHBOARD_TUTORIAL_STEP_COUNT } from './dashboardTutorialSteps';
import type { SpotlightRect } from './TutorialSpotlight';

const CARD_WIDTH = 360;
const CARD_HEIGHT = 260;
const CARD_GAP = 16;
const VIEWPORT_MARGIN = 16;

export type TutorialCardTail = 'top' | 'bottom' | 'left' | 'right' | 'none';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVerticalCardTop(rect: SpotlightRect) {
  return clamp(
    rect.top + rect.height / 2 - CARD_HEIGHT / 2,
    VIEWPORT_MARGIN,
    window.innerHeight - CARD_HEIGHT - VIEWPORT_MARGIN
  );
}

function getSidePosition(rect: SpotlightRect): { top: number; left: number; tail: TutorialCardTail } {
  const top = getVerticalCardTop(rect);
  const rightLeft = rect.left + rect.width + CARD_GAP;
  const leftLeft = rect.left - CARD_WIDTH - CARD_GAP;
  const rightFits = rightLeft + CARD_WIDTH <= window.innerWidth - VIEWPORT_MARGIN;
  const leftFits = leftLeft >= VIEWPORT_MARGIN;
  const targetCenter = rect.left + rect.width / 2;
  const preferRight = targetCenter < window.innerWidth * 0.55;

  if (preferRight && rightFits) {
    return { top, left: rightLeft, tail: 'left' };
  }
  if (!preferRight && leftFits) {
    return { top, left: leftLeft, tail: 'right' };
  }
  if (rightFits) {
    return { top, left: rightLeft, tail: 'left' };
  }
  if (leftFits) {
    return { top, left: leftLeft, tail: 'right' };
  }

  const belowTop = rect.top + rect.height + CARD_GAP;
  const aboveTop = rect.top - CARD_GAP - CARD_HEIGHT;
  const fitsBelow = belowTop + CARD_HEIGHT < window.innerHeight - VIEWPORT_MARGIN;
  const placeBelow = fitsBelow || aboveTop < VIEWPORT_MARGIN;

  return {
    top: placeBelow
      ? belowTop
      : clamp(aboveTop, VIEWPORT_MARGIN, window.innerHeight - CARD_HEIGHT - VIEWPORT_MARGIN),
    left: clamp(
      rect.left + rect.width / 2 - CARD_WIDTH / 2,
      VIEWPORT_MARGIN,
      window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN
    ),
    tail: placeBelow ? 'top' : 'bottom'
  };
}

export function getTutorialCardPosition(
  rect: SpotlightRect | null,
  placement: DashboardTutorialStep['placement']
): { top: number; left: number; tail: TutorialCardTail } {
  if (placement === 'center' || !rect) {
    return {
      top: Math.max(VIEWPORT_MARGIN, window.innerHeight / 2 - 160),
      left: clamp(
        window.innerWidth / 2 - CARD_WIDTH / 2,
        VIEWPORT_MARGIN,
        window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN
      ),
      tail: 'none'
    };
  }

  if (placement === 'side') {
    return getSidePosition(rect);
  }

  const preferBelow = placement !== 'above';
  const belowTop = rect.top + rect.height + CARD_GAP;
  const aboveTop = rect.top - CARD_GAP - CARD_HEIGHT;
  const fitsBelow = belowTop + CARD_HEIGHT < window.innerHeight - VIEWPORT_MARGIN;
  const placeBelow = preferBelow ? fitsBelow || aboveTop < VIEWPORT_MARGIN : !fitsBelow;

  const top = placeBelow
    ? belowTop
    : clamp(aboveTop, VIEWPORT_MARGIN, window.innerHeight - CARD_HEIGHT - VIEWPORT_MARGIN);

  const left = clamp(
    rect.left + rect.width / 2 - CARD_WIDTH / 2,
    VIEWPORT_MARGIN,
    window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN
  );

  return { top, left, tail: placeBelow ? 'top' : 'bottom' };
}

export function TutorialCard({
  step,
  stepIndex,
  position,
  onNext,
  onSkip,
  showSkip
}: {
  step: DashboardTutorialStep;
  stepIndex: number;
  position: { top: number; left: number; tail: TutorialCardTail };
  onNext: () => void;
  onSkip: () => void;
  showSkip: boolean;
}) {
  const progress = ((stepIndex + 1) / DASHBOARD_TUTORIAL_STEP_COUNT) * 100;

  return (
    <div
      className={clsx(
        'fixed z-[70] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-brand-green/40 bg-app-surface p-5 shadow-xl',
        step.isFinale && 'tutorial-finale-card'
      )}
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-labelledby="tutorial-title"
      aria-describedby="tutorial-body"
    >
      {position.tail === 'top' && (
        <span
          className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-brand-green/40 bg-app-surface"
          aria-hidden
        />
      )}
      {position.tail === 'bottom' && (
        <span
          className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-brand-green/40 bg-app-surface"
          aria-hidden
        />
      )}
      {position.tail === 'left' && (
        <span
          className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-b border-l border-brand-green/40 bg-app-surface"
          aria-hidden
        />
      )}
      {position.tail === 'right' && (
        <span
          className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-r border-t border-brand-green/40 bg-app-surface"
          aria-hidden
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-green">Dashboard Quest</p>
        <p className="text-[10px] font-medium text-app-text-muted tabular-nums">
          Mission {stepIndex + 1} of {DASHBOARD_TUTORIAL_STEP_COUNT}
        </p>
      </div>

      <p className="mt-1 text-xs italic text-app-text-muted">{step.quip}</p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-app-muted">
        <div
          className="h-full rounded-full bg-brand-green transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <h2 id="tutorial-title" className="mt-4 text-xl font-semibold text-brand-navy dark:text-brand-off-white">
        {step.title}
      </h2>
      <p id="tutorial-body" className="mt-2 text-sm leading-relaxed text-app-text-muted">
        {step.body}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3">
        {showSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-app-text-muted transition hover:text-app-text"
          >
            Skip tour
          </button>
        ) : (
          <span />
        )}
        <Button type="button" onClick={onNext}>
          {step.cta}
        </Button>
      </div>

      {step.isFinale && (
        <div className="tutorial-confetti pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          {Array.from({ length: 12 }).map((_, index) => (
            <span
              key={index}
              className="tutorial-confetti-piece absolute text-brand-green"
              style={{
                left: `${8 + index * 7}%`,
                animationDelay: `${index * 0.08}s`
              }}
            >
              ✦
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
