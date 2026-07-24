import { useEffect } from 'react';

type WakeLockSentinelLike = { release?: () => Promise<void> | void };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

/**
 * Keeps the screen awake while `active` (e.g. mid-workout). Progressive
 * enhancement — a silent no-op where the Wake Lock API is unavailable. The lock
 * is dropped by the browser on backgrounding, so we re-request on focus.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let released = false;

    const request = async () => {
      try {
        sentinel = (await nav.wakeLock!.request('screen')) ?? null;
      } catch {
        // user gesture required or unsupported — ignore
      }
    };

    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      try {
        void sentinel?.release?.();
      } catch {
        // ignore
      }
    };
  }, [active]);
}
