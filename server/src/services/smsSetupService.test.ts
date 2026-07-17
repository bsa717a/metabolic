import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractPhoneFromUserText, isSmsSetupConversation } from './smsSetupService.js';

describe('extractPhoneFromUserText', () => {
  it('finds common US phone formats', () => {
    assert.equal(extractPhoneFromUserText('my number is 510-375-9360'), '510-375-9360');
    assert.equal(extractPhoneFromUserText('call me at (801) 358-1855'), '(801) 358-1855');
    assert.equal(extractPhoneFromUserText('+1 510 375 9360'), '+1 510 375 9360');
  });

  it('finds bare 10-digit numbers', () => {
    assert.equal(extractPhoneFromUserText('8013581855'), '8013581855');
    assert.equal(extractPhoneFromUserText('here you go: 5103759360 thanks'), '5103759360');
  });

  it('returns null when no phone is present', () => {
    assert.equal(extractPhoneFromUserText('text START to opt in'), null);
  });
});

describe('isSmsSetupConversation', () => {
  it('detects SMS setup threads from quick replies', () => {
    assert.equal(
      isSmsSetupConversation([
        { content: 'Check my SMS texting setup with you — is my phone configured?' },
        { content: '8013581855' }
      ]),
      true
    );
  });
});
