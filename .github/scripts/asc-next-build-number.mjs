#!/usr/bin/env node
/**
 * Print the next iOS CURRENT_PROJECT_VERSION.
 *
 * An explicit BUILD_NUMBER wins. Otherwise this queries App Store Connect for
 * the highest numeric CFBundleVersion and returns one higher, never below 10
 * (builds 1–9 are already uploaded; 1.0 (9) is in App Review).
 *
 * Stdout is only the integer. The API key is read from disk and is not printed.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BUILD_FLOOR = 10;

export function nextBuildNumber(versions, options = {}) {
  const floor = options.floor ?? BUILD_FLOOR;
  const explicit = options.explicit;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== '') {
    const raw = String(explicit).trim();
    if (!/^[0-9]+$/.test(raw)) {
      throw new Error('build_number must be a positive integer');
    }
    const build = Number(raw);
    if (!Number.isSafeInteger(build) || build < floor) {
      throw new Error(
        `build_number must be an integer >= ${floor} so it cannot collide with TestFlight builds 1–${floor - 1}`
      );
    }
    return build;
  }

  let max = 0;
  for (const version of versions) {
    const raw = String(version).trim();
    if (!/^[0-9]+$/.test(raw)) continue;
    const build = Number(raw);
    if (Number.isSafeInteger(build) && build > max) max = build;
  }
  return Math.max(max + 1, floor);
}

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString('base64url');
}

export function signAppStoreConnectJwt({ keyId, issuerId, privateKeyPem, nowSeconds }) {
  const issuedAt = nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: issuerId,
      iat: issuedAt,
      exp: issuedAt + 19 * 60,
      aud: 'appstoreconnect-v1',
    })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign('SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${base64url(signature)}`;
}

async function listBuildVersions({ appId, token, fetchImpl = fetch }) {
  const versions = [];
  let url =
    `https://api.appstoreconnect.apple.com/v1/builds` +
    `?filter[app]=${encodeURIComponent(appId)}` +
    `&fields[builds]=version&limit=200&sort=-uploadedDate`;

  for (let page = 0; page < 10 && url; page += 1) {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`App Store Connect builds request failed (${response.status})`);
    }
    const body = await response.json();
    for (const item of body.data ?? []) {
      const version = item?.attributes?.version;
      if (version) versions.push(version);
    }
    url = body.links?.next || '';
  }
  return versions;
}

async function main() {
  const explicit = process.env.BUILD_NUMBER ?? '';
  if (String(explicit).trim()) {
    process.stdout.write(String(nextBuildNumber([], { explicit })));
    return;
  }

  const keyId = process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_ISSUER_ID;
  const keyPath = process.env.ASC_KEY_PATH;
  const appId = process.env.ASC_APP_ID || '6810053439';
  if (!keyId || !issuerId || !keyPath) {
    throw new Error('ASC_KEY_ID, ASC_ISSUER_ID, and ASC_KEY_PATH are required to query the latest build');
  }

  const privateKeyPem = readFileSync(keyPath, 'utf8');
  const token = signAppStoreConnectJwt({ keyId, issuerId, privateKeyPem });
  const versions = await listBuildVersions({ appId, token });
  const numeric = versions.filter((version) => /^[0-9]+$/.test(String(version).trim()));
  const next = nextBuildNumber(versions);
  console.error(`App Store Connect returned ${numeric.length} numeric build version(s); next is ${next}`);
  process.stdout.write(String(next));
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
