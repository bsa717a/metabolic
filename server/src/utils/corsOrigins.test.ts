import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { corsAllowedOrigins } from './corsOrigins.js';

describe('corsAllowedOrigins', () => {
  it('always includes the Capacitor and production web origins', () => {
    const origins = corsAllowedOrigins('https://metaos.mastermetabolic.com');
    assert.ok(origins.includes('https://metaos.mastermetabolic.com'));
    assert.ok(origins.includes('https://localhost'));
    assert.ok(origins.includes('capacitor://localhost'));
    assert.ok(origins.includes('capacitor://metaos.mastermetabolic.com'));
    assert.ok(origins.includes('https://metabolic-v1.web.app'));
    assert.ok(origins.includes('https://staging.metaos.mastermetabolic.com'));
    assert.ok(origins.includes('https://metabolic-staging.web.app'));
    assert.ok(origins.includes('https://metabolic-staging.firebaseapp.com'));
  });

  it('adds CLIENT_URL even when it is not in the static list', () => {
    const origins = corsAllowedOrigins('https://preview.example.com');
    assert.ok(origins.includes('https://preview.example.com'));
  });
});
