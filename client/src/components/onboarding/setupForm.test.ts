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

  it('keeps the virtual coach for tracking-only setup and still sends real-coach fields', () => {
    const payload = buildSetupPayload({
      ...formWithVirtualCoach(),
      trackingOnly: true,
      wantsCoach: true,
      coachCode: 'DF'
    });

    expect(payload.selectedVirtualCoachId).toBe('kali');
    expect(payload.trackingOnly).toBe(true);
    expect(payload.coachCode).toBe('DF');
    expect(payload.wantsCoach).toBe(true);
  });
});

describe('real coach onboarding stage', () => {
  const base = formWithVirtualCoach();

  it('requests a real coach and continues to submit', () => {
    const result = advanceCoachOnboarding('realCoachAsk', 'request', base, coach);
    expect(result.formPatch).toEqual({ wantsCoach: true, coachCode: '' });
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

  it('skips real coach support', () => {
    const result = advanceCoachOnboarding('realCoachAsk', 'skip', base, coach);
    expect(result.formPatch).toEqual({ wantsCoach: false, coachCode: '' });
    expect(result.next.stage).toBe('readyToSubmit');
  });
});
