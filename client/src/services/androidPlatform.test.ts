import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readClient(relPath: string) {
  return readFileSync(join(CLIENT_ROOT, relPath), 'utf8');
}

describe('Android Capacitor platform', () => {
  it('matches the iOS Capacitor 8 scripts and dependency range', () => {
    const pkg = JSON.parse(readClient('package.json')) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies['@capacitor/android']).toBe('^8.5.1');
    expect(pkg.dependencies['@capacitor/ios']).toBe('^8.5.1');
    expect(pkg.scripts['cap:sync:android']).toBe(
      'npm run native:patch && npm run build && npx cap sync android'
    );
    expect(pkg.scripts['cap:open:android']).toBe('npx cap open android');
    expect(pkg.scripts['cap:sync:ios']).toBe('npm run native:patch && npm run build && npx cap sync ios');
  });

  it('targets API 36 for com.mastermetabolic.app', () => {
    const variables = readClient('android/variables.gradle');
    expect(variables).toContain('compileSdkVersion = 36');
    expect(variables).toContain('targetSdkVersion = 36');
    expect(variables).toContain('rgcfaIncludeGoogle = true');
    expect(variables).toContain("androidxCredentialsVersion = '1.3.0'");
    const gradle = readClient('android/app/build.gradle');
    expect(gradle).toContain('namespace = "com.mastermetabolic.app"');
    expect(gradle).toContain('applicationId "com.mastermetabolic.app"');
    expect(gradle).toContain('targetSdkVersion rootProject.ext.targetSdkVersion');

    const colors = readClient('android/app/src/main/res/values/colors.xml');
    const classic = readClient('src/index.css').slice(0, readClient('src/index.css').indexOf('[data-theme="ocean"]'));
    expect(colors).toContain('name="colorPrimary"');
    expect(colors).toContain('name="colorPrimaryDark"');
    expect(colors).toContain('name="colorAccent"');
    for (const hex of ['#7da35d', '#6d8f52', '#e2c26e']) {
      expect(colors.toLowerCase()).toContain(hex);
      expect(classic.toLowerCase()).toContain(hex);
    }
  });

  it('declares verified App Links for the same join hosts as iOS', () => {
    const manifest = readClient('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:scheme="https"');
    expect(manifest.match(/android:pathPrefix="\/join"/g)).toHaveLength(2);
    const hosts = [...manifest.matchAll(/android:host="([^"]+)"/g)].map((match) => match[1]);
    expect(hosts).toEqual(['metaos.mastermetabolic.com', 'metabolic-v1.web.app']);
    const config = readClient('capacitor.config.ts');
    expect(config).toContain("androidScheme: 'https'");
    expect(config).toContain("contentInset: 'never'");
    expect(config).toContain('applinks:metaos.mastermetabolic.com');
    expect(config).toContain('applinks:metabolic-v1.web.app');
    const instrumented = readClient(
      'android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java'
    );
    expect(instrumented).toContain('assertEquals("com.mastermetabolic.app", appContext.getPackageName());');
    expect(instrumented).not.toContain('com.getcapacitor.app');
  });

  it('publishes a placeholder asset link and ignores signing secrets', () => {
    const statements = JSON.parse(readClient('public/.well-known/assetlinks.json')) as Array<{
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    expect(statements).toHaveLength(1);
    expect(statements[0].relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(statements[0].target.namespace).toBe('android_app');
    expect(statements[0].target.package_name).toBe('com.mastermetabolic.app');
    expect(statements[0].target.sha256_cert_fingerprints).toEqual(['PLACEHOLDER_PLAY_APP_SIGNING_SHA256']);
    expect(statements[0].target.sha256_cert_fingerprints[0]).not.toMatch(
      /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/
    );

    const ignore = readClient('android/.gitignore');
    expect(ignore).toMatch(/^google-services\.json$/m);
    expect(ignore).toMatch(/^\*\.jks$/m);
    expect(ignore).toMatch(/^\*\.keystore$/m);
    expect(ignore).toMatch(/^local\.properties$/m);
    expect(existsSync(join(CLIENT_ROOT, 'android/app/google-services.json'))).toBe(false);
    expect(existsSync(join(CLIENT_ROOT, 'android/google-services.json'))).toBe(false);

    const hosting = JSON.parse(readFileSync(join(CLIENT_ROOT, '../firebase.json'), 'utf8')) as {
      hosting: { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
    };
    const assetLinks = hosting.hosting.headers.find((entry) => entry.source === '/.well-known/assetlinks.json');
    expect(assetLinks?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Content-Type', value: 'application/json' },
        { key: 'Cache-Control', value: 'public, max-age=86400' }
      ])
    );
  });

  it('patches Android Google and Apple auth without changing the iOS copy', () => {
    const patch = readClient('scripts/apply-native-auth-patches.sh');
    expect(patch).toContain('GoogleAuthProviderHandler.swift');
    expect(patch).toContain('AppleAuthProviderHandler.swift');
    expect(patch).toContain('cp native/SceneDelegate.swift ios/App/App/SceneDelegate.swift');
    expect(patch).toContain('native/android/$handler');
    expect(patch).toContain('GoogleAuthProviderHandler.java');
    expect(patch).toContain('AppleAuthProviderHandler.java');
    expect(patch).toContain('OAuthProviderHandler.java');
    expect(patch).not.toContain('cp native/SceneDelegate.swift android');

    const google = readClient('native/android/GoogleAuthProviderHandler.java');
    expect(google).toContain('.requestIdToken(pluginImplementation.getPlugin().getContext().getString(R.string.default_web_client_id))');
    expect(google).toContain('metabolic.pendingGoogleAuth');
    expect(google).toContain('WILL_BE_OVERRIDDEN');
    expect(google).not.toMatch(/[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}/);

    const apple = readClient('native/android/AppleAuthProviderHandler.java');
    expect(apple).toContain('OAuthProvider.newBuilder');
    expect(apple).toContain('metabolic.pendingAppleNonce');
    expect(apple).toContain('Arrays.asList("email", "name")');
    expect(apple).toContain('getFirebaseAuthInstance().signOut()');
    expect(apple).not.toContain('ASAuthorizationController');

    const oauth = readClient('native/android/OAuthProviderHandler.java');
    expect(oauth).toContain('PENDING_NONCE_KEY');
    expect(oauth).toContain('skipNativeAuth');

    const activity = readClient('android/app/src/main/java/com/mastermetabolic/app/MainActivity.java');
    expect(activity).toContain('metabolic.pendingGoogleAuth');
    expect(activity).toContain('metabolic-pending-google-auth');
    expect(activity).toContain("window.location.origin !== 'https://metaos.mastermetabolic.com'");
    expect(activity).toContain('if (!"true".equals(result))');
    expect(activity).not.toContain('evaluateJavascript(js, result ->\n            getSharedPreferences');
    expect(activity).not.toContain('SessionCues');
    expect(activity).not.toContain('BillingClient');

    const gradle = readClient('android/app/build.gradle');
    expect(gradle).toContain('google-services.json');
    expect(gradle).toContain('Firebase Auth for Google and Apple');

    const setup = readClient('ANDROID.md');
    for (const needle of [
      'google-services.json',
      'SHA-1',
      'SHA-256',
      'UNKNOWN',
      'com.mastermetabolic.app',
      'metabolic-v1.firebaseapp.com/__/auth/handler',
      '707557008901-utr23g550vsjatn2g2fv112uq9daf7pr.apps.googleusercontent.com'
    ]) {
      expect(setup).toContain(needle);
    }
    expect(setup).not.toMatch(/[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){19}/);
    expect(setup).not.toMatch(/[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}/);
    expect(setup).not.toContain('AIza');
    expect(setup).not.toContain('BEGIN PRIVATE KEY');
  });
});
