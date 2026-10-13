import { clsx } from 'clsx';
import { formatClock, timerCueKind } from './format';

/** Large session clock that turns amber from 5s and reads its end label at zero. */
export function SessionTimerClock({
  remainingMs,
  paused = false,
  goLabel,
  size = 'rest'
}: {
  remainingMs: number;
  paused?: boolean;
  goLabel: string;
  size?: 'rest' | 'duration' | 'work';
}) {
  const kind = timerCueKind(remainingMs, paused);
  return (
    <div
      className={clsx(
        'font-bold tabular-nums',
        size === 'rest' && 'text-7xl sm:text-8xl',
        size === 'duration' && 'text-6xl sm:text-7xl',
        size === 'work' && 'text-5xl sm:text-6xl',
        kind === 'countdown' && 'animate-pulse text-amber-300',
        kind === 'go' && 'text-white',
        kind === 'idle' && 'text-white'
      )}
    >
      {kind === 'go' ? goLabel : formatClock(remainingMs)}
    </div>
  );
}
