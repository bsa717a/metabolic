import { useEffect } from 'react';

type WakeLockSentinelLike = {
  released?: boolean;
  release?: () => Promise<void> | void;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
};
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

/**
 * Keeps the screen awake while `active` (e.g. mid-workout or meal building).
 * Progressive enhancement — a silent no-op where the Wake Lock API is
 * unavailable. The lock is dropped by the browser on backgrounding, so we
 * re-request on focus. Some mobile browsers also require a user gesture, so
 * we retry on the next tap or keypress if the first request failed.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let onHeldRelease: (() => void) | null = null;
    let released = false;
    let requestInFlight = false;

    const detach = (held: WakeLockSentinelLike | null) => {
      if (!held) return;
      if (onHeldRelease) held.removeEventListener?.('release', onHeldRelease);
      if (sentinel === held) {
        sentinel = null;
        onHeldRelease = null;
      }
    };

    const adopt = (next: WakeLockSentinelLike | null) => {
      if (sentinel && sentinel !== next) {
        const previous = sentinel;
        detach(previous);
        try {
          void previous.release?.();
        } catch {
          // ignore
        }
      }
      sentinel = next;
      if (!next) {
        onHeldRelease = null;
        return;
      }
      const held = next;
      onHeldRelease = () => {
        if (sentinel === held) {
          sentinel = null;
          onHeldRelease = null;
        }
      };
      held.addEventListener?.('release', onHeldRelease);
    };

    const request = async () => {
      if (released || requestInFlight || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      requestInFlight = true;
      try {
        const next = (await nav.wakeLock!.request('screen')) ?? null;
        if (released) {
          void next?.release?.();
          return;
        }
        adopt(next);
      } catch {
        // user gesture required or unsupported — retry on the next interaction
      } finally {
        requestInFlight = false;
      }
    };

    void request();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void request();
    };
    const onUserGesture = () => {
      if (!released) void request();
    };

    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', onUserGesture, { passive: true });
    document.addEventListener('keydown', onUserGesture);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', onUserGesture);
      document.removeEventListener('keydown', onUserGesture);
      const held = sentinel;
      detach(held);
      try {
        void held?.release?.();
      } catch {
        // ignore
      }
    };
  }, [active]);
}
