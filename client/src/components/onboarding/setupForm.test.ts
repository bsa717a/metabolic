import { describe, expect, it } from 'vitest';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { advanceCoachOnboarding } from './coachOnboardingFlow';
import { buildSetupPayload, createEmptySetupForm } from './setupForm';

const coach = getVirtualCoach('kali')!;

function formWithVirtualCoach() {
  return {
    ...createEmptySetupForm(),
    weight: '180',
    goalWeight: '170',
    selectedVirtualCoachId: 'kali',
    timezone: 'America/Denver'
  };
}

describe('buildSetupPayload', () => {
  it('keeps the virtual coach when a real coach is also requested', () => {
    const payload = buildSetupPayload({
      ...formWithVirtualCoach(),
      wantsCoach: true,
      coachCode: 'DF'
    });

    expect(payload.selectedVirtualCoachId).toBe('kali');
    expect(payload.wantsCoach).toBe(true);
    expect(payload.coachCode).toBe('DF');
  });

  it('does not send tracking-only when a real coach invite is present', () => {
    const payload = buildSetupPayload({
      ...formWithVirtualCoach(),
      trackingOnly: true,
      coachCode: 'DF'
    });

    expect(payload.trackingOnly).toBeUndefined();
    expect(payload.coachCode).toBe('DF');
  });
});

describe('real coach onboarding stage', () => {
  const base = formWithVirtualCoach();

  it('requests a real coach and continues to submit', () => {
    const result = advanceCoachOnboarding('realCoachAsk', 'request', base, coach);
    expect(result.formPatch).toEqual({ wantsCoach: true });
    expect(result.next.stage).toBe('readyToSubmit');
    expect(result.next.assistantMessage).toContain('request for a real coach');
  });

  it('asks for a coach code when the user already works with a real coach', () => {
    const result = advanceCoachOnboarding('realCoachAsk', 'yes', base, coach);
    expect(result.next.stage).toBe('realCoachCode');
    expect(result.formPatch).toBeUndefined();
  });

  it('collects a coach code then continues to submit', () => {
    const ask = advanceCoachOnboarding('realCoachAsk', 'code', base, coach);
    expect(ask.next.stage).toBe('realCoachCode');

    const coded = advanceCoachOnboarding('realCoachCode', 'df', base, coach);
    expect(coded.formPatch).toEqual({ coachCode: 'DF', wantsCoach: false });
    expect(coded.next.stage).toBe('readyToSubmit');
    expect(coded.next.assistantMessage).toContain('coach code DF');
  });

  it('skips real coach support without wiping an existing invite code', () => {
    const result = advanceCoachOnboarding('realCoachAsk', 'skip', base, coach);
    expect(result.formPatch).toEqual({ wantsCoach: false });
    expect(result.next.stage).toBe('readyToSubmit');
  });

  it('keeps a pending invite code when skipping the real-coach question', () => {
    const invited = { ...base, coachCode: 'DF' };
    const result = advanceCoachOnboarding('realCoachAsk', 'skip', invited, coach);
    expect(result.formPatch).toEqual({ wantsCoach: false });
    expect(invited.coachCode).toBe('DF');
  });

  it('skips the real-coach question when an invite code is already on the form', () => {
    const invited = { ...base, coachCode: 'DF' };
    const result = advanceCoachOnboarding('phone', 'skip', invited, coach);
    expect(result.next.stage).toBe('readyToSubmit');
    expect(result.next.assistantMessage).toContain('invite you used');
  });
});

describe('invite onboarding', () => {
  const invited = { ...formWithVirtualCoach(), coachCode: 'DF' };

  it('skips the track-or-plan question after intro when an invite code is present', () => {
    const result = advanceCoachOnboarding('intro', 'continue', invited, coach);
    expect(result.formPatch).toEqual({ trackingOnly: false });
    expect(result.next.stage).toBe('weight');
  });

  it('skips tracking-only even if trackingMode is reached with an invite code', () => {
    const result = advanceCoachOnboarding('trackingMode', 'track', invited, coach);
    expect(result.formPatch).toEqual({ trackingOnly: false });
    expect(result.next.stage).toBe('weight');
  });

  it('still offers tracking-only when there is no invite code', () => {
    const result = advanceCoachOnboarding('intro', 'continue', formWithVirtualCoach(), coach);
    expect(result.next.stage).toBe('trackingMode');
    expect(result.next.quickReplies?.some((reply) => reply.value === 'track')).toBe(true);
  });
});
