import { useEffect, useState } from 'react';

/**
 * Returns a periodically-updated `Date.now()` for repainting timers. Timer math
 * lives in pure helpers; this only forces re-render. Also refreshes on tab focus
 * so a backgrounded countdown snaps to the correct value immediately.
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs, active]);

  return now;
}
