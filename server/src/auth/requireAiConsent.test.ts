import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireAiConsent } from './requireAiConsent.js';
import { AI_CONSENT_REQUIRED_MESSAGE } from '../services/aiConsent.js';

function mockReply() {
  const sent: { code?: number; body?: unknown } = {};
  const reply = {
    code(status: number) {
      sent.code = status;
      return {
        send(body: unknown) {
          sent.body = body;
          return body;
        }
      };
    }
  };
  return { reply, sent };
}

describe('requireAiConsent', () => {
  it('rejects unauthenticated requests', async () => {
    const { reply, sent } = mockReply();
    await requireAiConsent({ appUser: undefined } as never, reply as never);
    assert.equal(sent.code, 401);
  });

  it('blocks AI routes until the user accepts Gemini consent', async () => {
    const { reply, sent } = mockReply();
    await requireAiConsent({ appUser: { aiConsentAccepted: false } } as never, reply as never);
    assert.equal(sent.code, 403);
    assert.deepEqual(sent.body, {
      error: AI_CONSENT_REQUIRED_MESSAGE,
      code: 'AI_CONSENT_REQUIRED'
    });
  });

  it('allows transmission after consent', async () => {
    const { reply, sent } = mockReply();
    const result = await requireAiConsent({ appUser: { aiConsentAccepted: true } } as never, reply as never);
    assert.equal(result, undefined);
    assert.equal(sent.code, undefined);
  });
});
