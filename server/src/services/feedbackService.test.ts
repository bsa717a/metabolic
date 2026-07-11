import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PlanTier, Role } from '@prisma/client';
import { deriveAccountType, referenceFor, sanitizeDiagnostics } from './feedbackService.js';

describe('deriveAccountType', () => {
  it('labels admins and coaches by role', () => {
    assert.equal(deriveAccountType(Role.SUPER_ADMIN, PlanTier.STARTER), 'administrator');
    assert.equal(deriveAccountType(Role.ADMIN, PlanTier.PLUS), 'administrator');
    assert.equal(deriveAccountType(Role.COACH, PlanTier.COACH_LED), 'coach');
  });

  it('labels regular users by plan', () => {
    assert.equal(deriveAccountType(Role.USER, PlanTier.SELF_GUIDED), 'self_guided');
    assert.equal(deriveAccountType(Role.USER, PlanTier.PLUS), 'plus');
    assert.equal(deriveAccountType(Role.USER, PlanTier.COACH_LED), 'coach_led');
  });
});

describe('referenceFor', () => {
  it('formats the sequence as FB-N', () => {
    assert.equal(referenceFor(1), 'FB-1');
    assert.equal(referenceFor(1042), 'FB-1042');
  });
});

describe('sanitizeDiagnostics', () => {
  const valid = {
    browser: 'Chrome',
    os: 'macOS',
    deviceType: 'desktop',
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1200, height: 800 },
    timezone: 'America/Chicago',
    appVersion: 'abc123',
    featureFlags: ['meal_planning'],
    navTrail: [{ pathname: '/nutrition', at: '2026-07-11T00:00:00Z' }],
    clientErrors: [{ message: 'boom', source: 'app.js', at: '2026-07-11T00:00:00Z' }],
    failedRequests: [{ method: 'POST', path: '/api/x', status: 500, at: '2026-07-11T00:00:00Z' }],
    selectedRecord: { type: 'date', id: '2026-07-12' }
  };

  it('keeps the whitelist intact', () => {
    const out = sanitizeDiagnostics(valid)!;
    assert.equal(out.browser, 'Chrome');
    assert.equal((out.featureFlags as string[])[0], 'meal_planning');
    assert.equal((out.navTrail as unknown[]).length, 1);
    assert.deepEqual(out.selectedRecord, { type: 'date', id: '2026-07-12', label: null });
  });

  it('drops any key not in the whitelist', () => {
    const out = sanitizeDiagnostics({
      ...valid,
      AUTHORIZATION_TOKEN: 'secret',
      medicalNotes: 'diabetes',
      cookies: 'session=abc'
    })!;
    assert.ok(!('AUTHORIZATION_TOKEN' in out));
    assert.ok(!('medicalNotes' in out));
    assert.ok(!('cookies' in out));
  });

  it('strips query strings from failed request paths', () => {
    const out = sanitizeDiagnostics({
      ...valid,
      failedRequests: [{ method: 'GET', path: '/api/users/123/profile?token=SECRET', status: 403, at: 'now' }]
    })!;
    const req = (out.failedRequests as Array<{ path: string }>)[0];
    assert.equal(req.path, '/api/users/123/profile');
  });

  it('caps arrays and ignores malformed entries', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ pathname: `/p${i}`, at: 'now' }));
    const out = sanitizeDiagnostics({ ...valid, navTrail: [...many, { bogus: true }, 42, null] })!;
    assert.ok((out.navTrail as unknown[]).length <= 20);
  });

  it('returns null for non-objects', () => {
    assert.equal(sanitizeDiagnostics(null), null);
    assert.equal(sanitizeDiagnostics('nope'), null);
  });

  it('drops a selectedRecord missing type or id', () => {
    const out = sanitizeDiagnostics({ ...valid, selectedRecord: { label: 'x' } })!;
    assert.equal(out.selectedRecord, null);
  });
});
