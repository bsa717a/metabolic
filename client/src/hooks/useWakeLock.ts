import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

type WakeLockSentinelLike = {
  released?: boolean;
  release?: () => Promise<void> | void;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
};
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Keeps the screen awake while `active` (Nutrition logging, mid-workout).
 *
 * Native iOS: `@capacitor-community/keep-awake` sets `isIdleTimerDisabled`.
 * The Screen Wake Lock API is a no-op in WKWebView, which is why the phone
 * still slept on those screens.
 *
 * Web: progressive Wake Lock API. The lock is dropped on backgrounding, so
 * we re-request on focus. Some browsers also require a user gesture.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let released = false;

    if (isNativePlatform()) {
      const requestNative = async () => {
        if (released || document.visibilityState !== 'visible') return;
        try {
          await KeepAwake.keepAwake();
        } catch {
          // plugin missing in a web-only build
        }
      };
      void requestNative();
      const onVisible = () => {
        if (document.visibilityState === 'visible' && !released) void requestNative();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        released = true;
        document.removeEventListener('visibilitychange', onVisible);
        void KeepAwake.allowSleep().catch(() => undefined);
      };
    }

    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let onHeldRelease: (() => void) | null = null;
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
