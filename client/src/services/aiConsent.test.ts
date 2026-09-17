import { afterEach, describe, expect, it } from 'vitest';
import {
  AI_CONSENT_REQUIRED_MESSAGE,
  assertAiConsentForPath,
  hasAcceptedAiConsent,
  hasDecidedAiConsent,
  isAiTransmissionPath,
  readLocalAiConsent,
  syncRuntimeAiConsent,
  writeLocalAiConsent
} from './aiConsent';

describe('aiConsent', () => {
  afterEach(() => {
    window.localStorage.clear();
    syncRuntimeAiConsent('', false);
  });

  it('persists a local accept/decline decision per user', () => {
    expect(readLocalAiConsent('u1')).toBeNull();
    writeLocalAiConsent('u1', 'accepted');
    writeLocalAiConsent('u2', 'declined');
    expect(readLocalAiConsent('u1')).toBe('accepted');
    expect(readLocalAiConsent('u2')).toBe('declined');
    expect(hasDecidedAiConsent({ id: 'u1' })).toBe(true);
    expect(hasAcceptedAiConsent({ id: 'u1' })).toBe(true);
    expect(hasAcceptedAiConsent({ id: 'u2' })).toBe(false);
  });

  it('prefers the server decision once it exists', () => {
    writeLocalAiConsent('u1', 'accepted');
    expect(
      hasAcceptedAiConsent({
        id: 'u1',
        aiConsentAccepted: false,
        aiConsentDecidedAt: '2026-09-17T00:00:00.000Z'
      })
    ).toBe(false);
    expect(
      hasAcceptedAiConsent({
        id: 'u1',
        aiConsentAccepted: true,
        aiConsentDecidedAt: '2026-09-17T00:00:00.000Z'
      })
    ).toBe(true);
  });

  it('identifies Gemini transmission paths and skips the voice availability check', () => {
    expect(isAiTransmissionPath('/api/ai/chat')).toBe(true);
    expect(isAiTransmissionPath('/api/ai/food-lookup?x=1')).toBe(true);
    expect(isAiTransmissionPath('/api/ai/coach-voice')).toBe(true);
    expect(isAiTransmissionPath('/api/ai/coach-voice/available')).toBe(false);
    expect(isAiTransmissionPath('/api/virtual-coach/check-in/start')).toBe(true);
    expect(isAiTransmissionPath('/api/virtual-coach/check-in/abc/message')).toBe(true);
    expect(isAiTransmissionPath('/api/virtual-coach/check-in/state')).toBe(false);
    expect(isAiTransmissionPath('/api/me')).toBe(false);
    expect(isAiTransmissionPath('/api/nutrition/shopping-list')).toBe(false);
  });

  it('blocks AI API calls until runtime consent is accepted', () => {
    syncRuntimeAiConsent('u1', false);
    expect(() => assertAiConsentForPath('/api/ai/chat')).toThrow(AI_CONSENT_REQUIRED_MESSAGE);
    expect(() => assertAiConsentForPath('/api/me')).not.toThrow();
    syncRuntimeAiConsent('u1', true);
    expect(() => assertAiConsentForPath('/api/ai/chat')).not.toThrow();
  });
});
