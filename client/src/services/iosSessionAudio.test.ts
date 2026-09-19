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
    expect(scene).toContain('enum MixableAudioSession');
    expect(scene).toContain('func configure()');
    expect(scene).toContain('setCategory(.playback, mode: .default, options: mix)');
    expect(scene).toContain('.mixWithOthers');
    expect(scene).not.toMatch(/setActive\(\s*false\s*\)/);
    expect(scene).toContain('opts.remove(.duckOthers)');
    expect(scene).toContain('setActive(true)');
    expect(scene).toContain('MixableAudioSession.install()');
    expect(scene).toContain('MixableAudioSession.configure()');
    expect(scene).toContain('func observeAudioSession()');
    expect(scene).toContain('AVAudioSession.interruptionNotification');
    expect(scene).toContain('AVAudioSession.mediaServicesWereResetNotification');
    expect(scene).toContain('func sceneDidBecomeActive');
    const connect = scene.slice(scene.indexOf('func scene('), scene.indexOf('func sceneDidBecomeActive'));
    expect(connect.indexOf('MixableAudioSession.install()')).toBeLessThan(
      connect.indexOf('MetabolicBridgeViewController()')
    );
    const becomeActive = scene.slice(scene.indexOf('func sceneDidBecomeActive'));
    expect(becomeActive).toContain('MixableAudioSession.configure()');
  });

  it('plays workout cues via in-process AVAudioPlayer, not WKWebView media', () => {
    const scene = readClient('native/SceneDelegate.swift');
    expect(scene).toContain('class SessionCuesPlugin');
    expect(scene).toContain('CAPBridgedPlugin');
    expect(scene).toContain('jsName = "SessionCues"');
    expect(scene).toContain('func playTick');
    expect(scene).toContain('func playGo');
    expect(scene).toContain('class CueAudioPlayer');
    expect(scene).toContain('AVAudioPlayer');
    expect(scene).toContain('public/audio/go.wav');
    expect(scene).toContain('class MetabolicBridgeViewController');
    expect(scene).toContain('func capacitorDidLoad');
    expect(scene).toContain('registerPluginInstance(SessionCuesPlugin())');
    expect(scene).not.toContain('MPNowPlayingInfoCenter');
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
    expect(cues).toContain("registerPlugin<SessionCuesNativePlugin>('SessionCues')");
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
    expect(cues).toContain('playNativeCue');
    expect(cues).toContain('SessionCuesNative.prime()');
    expect(cues).not.toContain("nav.audioSession.type = isNativePlatform() ? 'playback'");
    expect(cues).not.toContain('function primeGoClip');
    expect(cues).not.toContain('speechSynthesis');
    expect(cues).not.toContain('SpeechSynthesisUtterance');
    expect(cues).not.toContain('HTMLAudio first');
    expect(cues).toContain("addEventListener('visibilitychange'");
    expect(cues).toContain("addEventListener('pageshow'");
    expect(cues).toContain("console.warn(`[sessionCues]");

    expect(existsSync(join(CLIENT_ROOT, 'public/audio/go.wav'))).toBe(true);

    const session = readClient('src/hooks/useWorkoutSession.ts');
    expect(session).toContain('COUNTDOWN_TICK_MARKS_MS');
    expect(session).not.toMatch(/COUNTDOWN_MARKS_MS = \[3000, 2000, 1000\]/);
  });
});
