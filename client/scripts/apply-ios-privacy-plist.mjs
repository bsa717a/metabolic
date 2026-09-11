#!/usr/bin/env node
/**
 * Merge camera / photo privacy usage strings into the generated iOS Info.plist.
 *
 * Capacitor does not apply `ios.infoPlist` from capacitor.config.ts. Missing
 * NSCameraUsageDescription causes iOS to terminate the app when the camera
 * is opened (the TestFlight crash).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE_PATH = join(CLIENT_ROOT, 'native/ios-privacy-usage.json');
const DEFAULT_PLIST_PATH = join(CLIENT_ROOT, 'ios/App/App/Info.plist');

export const REQUIRED_PRIVACY_KEYS = [
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription'
];

export function loadPrivacyUsage(path = USAGE_PATH) {
  const usage = JSON.parse(readFileSync(path, 'utf8'));
  for (const key of REQUIRED_PRIVACY_KEYS) {
    if (typeof usage[key] !== 'string' || !usage[key].trim()) {
      throw new Error(`ios-privacy-usage.json is missing a non-empty ${key}`);
    }
  }
  return usage;
}

export function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function applyPrivacyKeysToPlist(xml, usage) {
  if (!/<plist[\s>]/.test(xml) || !/<\/plist>/.test(xml)) {
    throw new Error('Not a valid Info.plist XML document');
  }

  let next = xml;
  for (const [key, value] of Object.entries(usage)) {
    const escaped = escapeXml(value);
    const existing = new RegExp(
      `(<key>${key}</key>\\s*)(<string>)[\\s\\S]*?(</string>)`
    );
    if (existing.test(next)) {
      next = next.replace(existing, `$1$2${escaped}$3`);
      continue;
    }

    const insertion = `\t<key>${key}</key>\n\t<string>${escaped}</string>\n`;
    if (!/<\/dict>\s*<\/plist>\s*$/.test(next)) {
      throw new Error('Could not find the root </dict></plist> in Info.plist');
    }
    next = next.replace(/<\/dict>\s*<\/plist>\s*$/, `${insertion}</dict>\n</plist>\n`);
  }
  return next;
}

export function mergePrivacyPlist(plistPath = DEFAULT_PLIST_PATH, usagePath = USAGE_PATH) {
  if (!existsSync(plistPath)) {
    return { skipped: true, path: plistPath };
  }
  const usage = loadPrivacyUsage(usagePath);
  const current = readFileSync(plistPath, 'utf8');
  const next = applyPrivacyKeysToPlist(current, usage);
  if (next !== current) {
    writeFileSync(plistPath, next);
  }
  return { skipped: false, path: plistPath, changed: next !== current };
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = mergePrivacyPlist(process.argv[2] || DEFAULT_PLIST_PATH);
  if (result.skipped) {
    console.log('ios/App/App/Info.plist not found; skipping privacy key merge (generate iOS on a Mac first).');
  } else {
    console.log(
      result.changed
        ? `Merged camera/photo privacy usage descriptions into ${result.path}`
        : `Camera/photo privacy usage descriptions already present in ${result.path}`
    );
  }
}
