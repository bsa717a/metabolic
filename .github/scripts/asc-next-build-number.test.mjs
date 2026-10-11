import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { nextBuildNumber, signAppStoreConnectJwt } from './asc-next-build-number.mjs';

test('explicit build number must be an integer past 1–9', () => {
  assert.equal(nextBuildNumber([], { explicit: '10' }), 10);
  assert.equal(nextBuildNumber(['99'], { explicit: '12' }), 12);
  assert.throws(() => nextBuildNumber([], { explicit: '9' }), /integer >= 10/);
  assert.throws(() => nextBuildNumber([], { explicit: '1.0' }), /positive integer/);
});

test('next build is one past the highest uploaded number, and at least 10', () => {
  assert.equal(nextBuildNumber([]), 10);
  assert.equal(nextBuildNumber(['1', '9', '8']), 10);
  assert.equal(nextBuildNumber(['9', '14', '3']), 15);
  assert.equal(nextBuildNumber(['9', '1.0.9', 'build-9']), 10);
});

test('TestFlight workflow is manual dispatch only and pins Xcode 26.6', () => {
  const workflow = readFileSync(new URL('../workflows/ios-testflight.yml', import.meta.url), 'utf8');
  const header = workflow.split(/^jobs:/m)[0];
  assert.match(header, /^on:\n {2}workflow_dispatch:/m);
  assert.doesNotMatch(header, /\n {2}(push|pull_request):/);
  assert.match(workflow, /Xcode_26\.6\.app/);
  assert.match(workflow, /minimumZoomScale = 1/);
  assert.match(workflow, /if: always\(\)/);
});

test('App Store Connect JWT is three segments and does not embed the PEM', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = signAppStoreConnectJwt({
    keyId: 'TESTKEY123',
    issuerId: '00000000-0000-0000-0000-000000000000',
    privateKeyPem: pem,
    nowSeconds: 1_700_000_000,
  });
  assert.equal(jwt.split('.').length, 3);
  assert.equal(jwt.includes('BEGIN PRIVATE KEY'), false);
});
