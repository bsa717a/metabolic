import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSmsMediaFromWebhook, xmlEscapeTwiml } from './smsWebhookMedia.js';

describe('extractSmsMediaFromWebhook', () => {
  it('reads MediaUrl0 and NumMedia from Twilio webhook bodies', () => {
    const result = extractSmsMediaFromWebhook({
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123',
      MediaContentType0: 'image/jpeg',
      AccountSid: 'AC123'
    });

    assert.equal(result.numMedia, 1);
    assert.equal(result.mediaMissing, false);
    assert.equal(result.media?.url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM123/Media/ME123');
    assert.equal(result.media?.mimeType, 'image/jpeg');
    assert.equal(result.media?.accountSid, 'AC123');
  });

  it('falls back when NumMedia is missing but MediaUrl0 is present', () => {
    const result = extractSmsMediaFromWebhook({
      MediaUrl0: 'https://api.twilio.com/media/1',
      MediaContentType0: 'image/heic'
    });

    assert.equal(result.numMedia, 1);
    assert.equal(result.media?.mimeType, 'image/heic');
  });

  it('flags mediaMissing when Twilio reports media without a URL', () => {
    const result = extractSmsMediaFromWebhook({ NumMedia: '1' });
    assert.equal(result.mediaMissing, true);
    assert.equal(result.media, undefined);
  });
});

describe('xmlEscapeTwiml', () => {
  it('escapes characters instead of stripping them', () => {
    assert.equal(xmlEscapeTwiml("It's <fine> & good"), "It&apos;s &lt;fine&gt; &amp; good");
  });
});
