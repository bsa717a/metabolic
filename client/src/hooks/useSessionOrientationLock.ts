import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Locks the native shell to portrait while an active workout session is on
 * screen so a rotation cannot hide set / rest controls. Unlocks on leave or
 * when the session ends (summary). Web is left unlocked.
 */
export function useSessionOrientationLock(active: boolean): void {
  useEffect(() => {
    if (!active || !isNativePlatform()) return;

    let locked = false;
    let cancelled = false;

    const lock = async () => {
      try {
        await ScreenOrientation.lock({ orientation: 'portrait' });
        if (cancelled) {
          await ScreenOrientation.unlock();
          return;
        }
        locked = true;
      } catch {
        // iPad without Requires Full Screen, or plugin not synced yet
      }
    };

    void lock();

    return () => {
      cancelled = true;
      if (!locked) return;
      void ScreenOrientation.unlock().catch(() => undefined);
    };
  }, [active]);
}
