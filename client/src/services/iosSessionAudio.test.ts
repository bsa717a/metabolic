import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readClient(relPath: string) {
  return readFileSync(join(CLIENT_ROOT, relPath), 'utf8');
}

describe('iOS Capacitor session audio + haptics wiring', () => {
  it('configures AVAudioSession playback + mixWithOthers in the copied SceneDelegate', () => {
    const scene = readClient('native/SceneDelegate.swift');
    expect(scene).toContain('import AVFoundation');
    expect(scene).toContain('func configurePlaybackAudioSession()');
    expect(scene).toContain('setCategory(.playback, mode: .default, options: [.mixWithOthers])');
    expect(scene).not.toContain('duckOthers');
    expect(scene).toContain('setActive(true)');
    expect(scene).toMatch(/configurePlaybackAudioSession\(\)/);
    expect(scene).toContain('func observeAudioSession()');
    expect(scene).toContain('AVAudioSession.interruptionNotification');
    expect(scene).toContain('AVAudioSession.mediaServicesWereResetNotification');
    expect(scene).toContain('func sceneDidBecomeActive');
    const becomeActive = scene.slice(scene.indexOf('func sceneDidBecomeActive'));
    expect(becomeActive).toContain('configurePlaybackAudioSession()');
  });

  it('copies SceneDelegate via native:patch so TestFlight shells pick up the session', () => {
    const patch = readClient('scripts/apply-native-auth-patches.sh');
    expect(patch).toContain('cp native/SceneDelegate.swift ios/App/App/SceneDelegate.swift');
  });

  it('depends on @capacitor/haptics for native tick/GO impacts', () => {
    const pkg = JSON.parse(readClient('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor/haptics']).toBe('^8.0.2');

    const cues = readClient('src/utils/sessionCues.ts');
    expect(cues).toContain("from '@capacitor/haptics'");
    expect(cues).toContain('ImpactStyle.Light');
    expect(cues).toContain('ImpactStyle.Heavy');
    expect(cues).toMatch(/gain:\s*1/);
    expect(cues).toMatch(/HTML_VOLUME\s*=\s*1/);
    expect(cues).toMatch(/WAV_PEAK\s*=\s*32767/);
    expect(cues).toContain('COUNTDOWN_TICK_MARKS_MS = [5000, 3000, 2000, 1000]');
    expect(cues).toContain("GO_CLIP_URL = '/audio/go.wav'");
    expect(cues).toContain('function preloadGoClip');
    expect(cues).toContain('primeSilentHtmlAudio');
    expect(cues).toContain('if (isNativePlatform()) return');
    expect(cues).toContain('HTMLAudio first');
    expect(cues).not.toContain("nav.audioSession.type = isNativePlatform() ? 'playback'");
    expect(cues).not.toContain('function primeGoClip');
    expect(cues).not.toContain('speechSynthesis');
    expect(cues).not.toContain('SpeechSynthesisUtterance');
    expect(cues).toContain("addEventListener('visibilitychange'");
    expect(cues).toContain("addEventListener('pageshow'");
    expect(cues).toContain("console.warn(`[sessionCues]");

    expect(existsSync(join(CLIENT_ROOT, 'public/audio/go.wav'))).toBe(true);

    const session = readClient('src/hooks/useWorkoutSession.ts');
    expect(session).toContain('COUNTDOWN_TICK_MARKS_MS');
    expect(session).not.toMatch(/COUNTDOWN_MARKS_MS = \[3000, 2000, 1000\]/);
  });
});
