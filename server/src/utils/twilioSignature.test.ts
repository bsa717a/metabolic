import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTwilioSignature } from './twilioSignature.js';

describe('computeTwilioSignature', () => {
  it('matches a stable reference for a known payload', () => {
    const url = 'https://mycompany.com/myapp.php';
    const body = { Body: 'jenny', From: '+15558675310' };
    const signature = computeTwilioSignature('12345', url, body);
    assert.equal(signature, 'rES9NE8oyS6eMJccl/ue3MnvK38=');
  });

  it('is sensitive to the signed URL', () => {
    const body = { Body: 'hi', From: '+15558675310' };
    const a = computeTwilioSignature('token', 'https://api.example.com/api/sms/webhook', body);
    const b = computeTwilioSignature('token', 'https://other.example.com/api/sms/webhook', body);
    assert.notEqual(a, b);
  });
});
