import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

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
    const gradle = readClient('android/app/build.gradle');
    expect(gradle).toContain('namespace = "com.mastermetabolic.app"');
    expect(gradle).toContain('applicationId "com.mastermetabolic.app"');
    expect(gradle).toContain('targetSdkVersion rootProject.ext.targetSdkVersion');
  });

  it('declares verified App Links for the production join URL', () => {
    const manifest = readClient('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:scheme="https"');
    expect(manifest).toContain('android:host="metaos.mastermetabolic.com"');
    expect(manifest).toContain('android:pathPrefix="/join"');
    const config = readClient('capacitor.config.ts');
    expect(config).toContain("androidScheme: 'https'");
    expect(config).toContain("contentInset: 'never'");
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

  it('leaves the iOS auth patch in place and does not fork the Android handlers', () => {
    const patch = readClient('scripts/apply-native-auth-patches.sh');
    expect(patch).toContain('GoogleAuthProviderHandler.swift');
    expect(patch).toContain('AppleAuthProviderHandler.swift');
    expect(patch).toContain('cp native/SceneDelegate.swift ios/App/App/SceneDelegate.swift');
    expect(patch).toContain('Android needs no counterpart copy');
    expect(patch).not.toMatch(/cp\s+.*\.java/);

    const pluginRoot = dirname(require.resolve('@capacitor-firebase/authentication/package.json'));
    const google = readFileSync(
      join(
        pluginRoot,
        'android/src/main/java/io/capawesome/capacitorjs/plugins/firebase/authentication/handlers/GoogleAuthProviderHandler.java'
      ),
      'utf8'
    );
    expect(google).toContain('.requestIdToken(pluginImplementation.getPlugin().getContext().getString(R.string.default_web_client_id))');
    const apple = readFileSync(
      join(
        pluginRoot,
        'android/src/main/java/io/capawesome/capacitorjs/plugins/firebase/authentication/handlers/AppleAuthProviderHandler.java'
      ),
      'utf8'
    );
    expect(apple).toContain('OAuthProvider.newBuilder');
    expect(apple).not.toContain('ASAuthorizationController');
  });
});
