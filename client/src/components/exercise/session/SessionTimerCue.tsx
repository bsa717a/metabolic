import { clsx } from 'clsx';
import { formatClock, timerCueKind } from './format';

/** Large session clock that turns amber on 3-2-1 and reads GO / Time at zero. */
export function SessionTimerClock({
  remainingMs,
  paused = false,
  goLabel,
  size = 'rest'
}: {
  remainingMs: number;
  paused?: boolean;
  goLabel: string;
  size?: 'rest' | 'duration';
}) {
  const kind = timerCueKind(remainingMs, paused);
  return (
    <div
      className={clsx(
        'font-bold tabular-nums',
        size === 'rest' ? 'text-7xl sm:text-8xl' : 'text-6xl sm:text-7xl',
        kind === 'countdown' && 'animate-pulse text-amber-300',
        kind === 'go' && 'text-white',
        kind === 'idle' && 'text-white'
      )}
    >
      {kind === 'go' ? goLabel : formatClock(remainingMs)}
    </div>
  );
}
