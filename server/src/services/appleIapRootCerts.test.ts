import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { X509Certificate } from 'node:crypto';
import { appleRootCaDerBuffers } from './appleIapRootCerts.js';

describe('appleRootCaDerBuffers', () => {
  it('embeds the public Apple Root CA G3 and G2 certificates', () => {
    const certs = appleRootCaDerBuffers();
    assert.equal(certs.length, 2);
    const subjects = certs.map((der) => new X509Certificate(der).subject);
    assert.match(subjects[0] ?? '', /Apple Root CA - G3/);
    assert.match(subjects[1] ?? '', /Apple Root CA - G2/);
  });
});
