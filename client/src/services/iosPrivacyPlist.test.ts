import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(CLIENT_ROOT, 'scripts/apply-ios-privacy-plist.mjs');
const USAGE_PATH = join(CLIENT_ROOT, 'native/ios-privacy-usage.json');

const REQUIRED_PRIVACY_KEYS = [
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription'
] as const;

const EMPTY_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Master Metabolic</string>
</dict>
</plist>
`;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function usageFromDisk(): Record<(typeof REQUIRED_PRIVACY_KEYS)[number], string> {
  return JSON.parse(readFileSync(USAGE_PATH, 'utf8'));
}

function mergeViaScript(xml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ios-privacy-plist-'));
  tempDirs.push(dir);
  const plistPath = join(dir, 'Info.plist');
  writeFileSync(plistPath, xml);
  execFileSync(process.execPath, [SCRIPT, plistPath], { cwd: CLIENT_ROOT });
  return readFileSync(plistPath, 'utf8');
}

describe('iOS privacy Info.plist merge', () => {
  it('requires the three camera and photo usage keys', () => {
    const usage = usageFromDisk();
    expect(Object.keys(usage).sort()).toEqual([...REQUIRED_PRIVACY_KEYS].sort());
    for (const key of REQUIRED_PRIVACY_KEYS) {
      expect(usage[key].length).toBeGreaterThan(20);
    }
  });

  it('inserts missing usage keys before the root dict close', () => {
    const usage = usageFromDisk();
    const merged = mergeViaScript(EMPTY_PLIST);
    for (const key of REQUIRED_PRIVACY_KEYS) {
      expect(merged).toContain(`<key>${key}</key>`);
      expect(merged).toContain(`<string>${usage[key]}</string>`);
    }
    expect(merged).toMatch(/<\/dict>\s*<\/plist>/);
  });

  it('updates an existing usage string in place', () => {
    const stale = EMPTY_PLIST.replace(
      '</dict>',
      '\t<key>NSCameraUsageDescription</key>\n\t<string>stale</string>\n</dict>'
    );
    const usage = usageFromDisk();
    const merged = mergeViaScript(stale);
    expect(merged).toContain(usage.NSCameraUsageDescription);
    expect(merged).not.toContain('stale');
    expect(merged.match(/NSCameraUsageDescription/g)?.length).toBe(1);
  });
});
