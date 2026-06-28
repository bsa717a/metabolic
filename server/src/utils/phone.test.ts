import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, phonesMatch } from './phone.js';

describe('normalizePhone', () => {
  it('adds US country code to 10-digit numbers', () => {
    assert.equal(normalizePhone('5103759360'), '+15103759360');
    assert.equal(normalizePhone('408-221-1569'), '+14082211569');
    assert.equal(normalizePhone('(510) 375-9360'), '+15103759360');
  });

  it('fixes numbers that only had a plus prefix', () => {
    assert.equal(normalizePhone('+5103759360'), '+15103759360');
    assert.equal(normalizePhone('+408-221-1569'), '+14082211569');
  });

  it('preserves valid US E.164 numbers', () => {
    assert.equal(normalizePhone('+19044030781'), '+19044030781');
    assert.equal(normalizePhone('+1 (904) 403-0781'), '+19044030781');
    assert.equal(normalizePhone('19044030781'), '+19044030781');
  });

  it('fixes US numbers with an extra trailing digit', () => {
    assert.equal(normalizePhone('80135818559'), '+18013581855');
    assert.equal(normalizePhone('80161614421'), '+18016161442');
  });

  it('preserves whatsapp prefix handling', () => {
    assert.equal(normalizePhone('whatsapp:+15103759360'), '+15103759360');
  });

  it('preserves longer international numbers', () => {
    assert.equal(normalizePhone('+447911123456'), '+447911123456');
    assert.equal(normalizePhone('+61412345678'), '+61412345678');
  });
});

describe('phonesMatch', () => {
  it('matches US numbers with different formatting', () => {
    assert.equal(phonesMatch('+5103759360', '+15103759360'), true);
    assert.equal(phonesMatch('+15103759360', '+15103759360'), true);
  });
});
