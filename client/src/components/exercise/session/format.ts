export type TimerCueKind = 'idle' | 'countdown' | 'go';

/** Visual/audio cue band for a running rest or duration timer. */
export function timerCueKind(remainingMs: number, paused: boolean): TimerCueKind {
  if (paused) return 'idle';
  if (remainingMs <= 0) return 'go';
  if (remainingMs <= 3000) return 'countdown';
  return 'idle';
}

/** Format milliseconds as m:ss (or h:mm:ss past an hour). */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
