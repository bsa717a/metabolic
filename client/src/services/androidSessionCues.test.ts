import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readClient(relPath: string) {
  return readFileSync(join(CLIENT_ROOT, relPath), 'utf8');
}

describe('Android SessionCues', () => {
  it('ports the iOS in-process player instead of hiding the cue control', () => {
    const plugin = readClient('android/app/src/main/kotlin/com/mastermetabolic/app/SessionCuesPlugin.kt');
    expect(plugin).toContain('@CapacitorPlugin(name = "SessionCues")');
    expect(plugin).toContain('fun prime');
    expect(plugin).toContain('fun playTick');
    expect(plugin).toContain('fun playGo');
    expect(plugin).toContain('fun playStop');
    expect(plugin).toContain('override fun handleOnDestroy');
    expect(plugin).not.toContain('requestAudioFocus');
    expect(plugin).not.toContain('BillingClient');

    const player = readClient('android/app/src/main/kotlin/com/mastermetabolic/app/CueAudioPlayer.kt');
    expect(player).toContain('AudioTrack');
    expect(player).toContain('USAGE_MEDIA');
    expect(player).toContain('CONTENT_TYPE_SONIFICATION');
    expect(player).toContain('MODE_STATIC');
    expect(player).toContain('setVolume(1f)');
    expect(player).toContain('public/audio/$name.wav');
    expect(player).toContain('getIdentifier(name, "raw"');
    expect(player).toContain('native tick unavailable');
    expect(player).toContain('native Go clip unavailable');
    expect(player).toContain('native Stop clip unavailable');
    expect(player).not.toContain('requestAudioFocus');
    expect(player).not.toContain('AUDIOFOCUS');
    expect(player).not.toContain('AudioManager');
    expect(player).not.toContain('BillingClient');

    const tone = readClient('android/app/src/main/kotlin/com/mastermetabolic/app/CueTone.kt');
    expect(tone).toContain('CueTone(880.0, 0.15, 1.0)');
    expect(tone).toContain('CueTone(1175.0, 0.22, 1.0)');
    expect(tone).toContain('CueTone(220.0, 0.32, 1.0)');
    expect(tone).toContain('SAMPLE_RATE = 22050');
    expect(tone).toContain('1.0 to 0.7');
    expect(tone).toContain('2.0 to 0.22');
    expect(tone).toContain('3.0 to 0.08');
    expect(tone).toContain('fun roundHalfAwayFromZero');

    const activity = readClient('android/app/src/main/java/com/mastermetabolic/app/MainActivity.java');
    const onCreate = activity.slice(activity.indexOf('void onCreate'), activity.indexOf('void onResume'));
    expect(onCreate.indexOf('registerPlugin(SessionCuesPlugin.class)')).toBeLessThan(
      onCreate.indexOf('super.onCreate')
    );

    const rootGradle = readClient('android/build.gradle');
    expect(rootGradle).toContain("classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0'");
    const appGradle = readClient('android/app/build.gradle');
    expect(appGradle).toContain("apply plugin: 'kotlin-android'");
    expect(appGradle).toContain('JvmTarget.JVM_21');
    expect(appGradle).not.toContain('billing');

    const page = readClient('src/pages/WorkoutSessionPage.tsx');
    expect(page).toContain('Mute workout cues');
    expect(page).not.toContain('isNativeIos');

    const cues = readClient('src/utils/sessionCues.ts');
    expect(cues).toContain("registerPlugin<SessionCuesNativePlugin>('SessionCues')");
    expect(cues).toContain('if (!isNativePlatform()) return false');
    expect(cues).not.toContain('hidesSessionCues');
    expect(cues).not.toContain("getPlatform() === 'android'");

    const scene = readClient('native/SceneDelegate.swift');
    expect(scene).toContain('class SessionCuesPlugin');
    expect(scene).toContain('jsName = "SessionCues"');

    const goPublic = readFileSync(join(CLIENT_ROOT, 'public/audio/go.wav'));
    const stopPublic = readFileSync(join(CLIENT_ROOT, 'public/audio/stop.wav'));
    const goRaw = readFileSync(join(CLIENT_ROOT, 'android/app/src/main/res/raw/go.wav'));
    const stopRaw = readFileSync(join(CLIENT_ROOT, 'android/app/src/main/res/raw/stop.wav'));
    expect(Buffer.compare(goPublic, goRaw)).toBe(0);
    expect(Buffer.compare(stopPublic, stopRaw)).toBe(0);
    expect(existsSync(join(CLIENT_ROOT, 'android/app/google-services.json'))).toBe(false);
  });
});
