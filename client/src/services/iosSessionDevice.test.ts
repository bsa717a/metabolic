import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readClient(relPath: string) {
  return readFileSync(join(CLIENT_ROOT, relPath), 'utf8');
}

describe('iOS keep-awake + workout orientation lock', () => {
  it('depends on KeepAwake and Screen Orientation Capacitor plugins', () => {
    const pkg = JSON.parse(readClient('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor-community/keep-awake']).toBe('^8.0.1');
    expect(pkg.dependencies['@capacitor/screen-orientation']).toBe('^8.0.1');
  });

  it('uses native KeepAwake on Nutrition and active workout screens', () => {
    const wake = readClient('src/hooks/useWakeLock.ts');
    expect(wake).toContain("from '@capacitor-community/keep-awake'");
    expect(wake).toContain('KeepAwake.keepAwake()');
    expect(wake).toContain('KeepAwake.allowSleep()');
    expect(wake).toContain('isNativePlatform()');
    expect(wake).toContain("nav.wakeLock!.request('screen')");

    const nutrition = readClient('src/pages/NutritionPage.tsx');
    expect(nutrition).toContain('useWakeLock(true)');

    const nutritionLog = readClient('src/pages/NutritionLogPage.tsx');
    expect(nutritionLog).toContain('useWakeLock(true)');

    const workout = readClient('src/pages/WorkoutSessionPage.tsx');
    expect(workout).toContain('useWakeLock(active)');
    expect(workout).toContain('useSessionOrientationLock(active)');
    expect(workout).toContain("state?.phase !== 'summary'");
  });

  it('locks portrait only while the workout session is active', () => {
    const lock = readClient('src/hooks/useSessionOrientationLock.ts');
    expect(lock).toContain("from '@capacitor/screen-orientation'");
    expect(lock).toContain("ScreenOrientation.lock({ orientation: 'portrait' })");
    expect(lock).toContain('ScreenOrientation.unlock()');
    expect(lock).toContain('isNativePlatform()');
    expect(lock).not.toContain("orientation: 'landscape'");
  });
});
