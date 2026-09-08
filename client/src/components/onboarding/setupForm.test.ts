import { describe, expect, it } from 'vitest';
import { getVirtualCoach } from '../../data/virtualCoaches';
import { advanceCoachOnboarding, getOnboardingProgress } from './coachOnboardingFlow';
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

describe('getOnboardingProgress', () => {
  it('returns step 1 of 12 at intro without invite code', () => {
    const progress = getOnboardingProgress('intro', false);
    expect(progress.currentStep).toBe(1);
    expect(progress.totalSteps).toBe(12);
    expect(progress.mainStepLabel).toBe('Welcome');
  });

  it('returns step 1 of 10 at intro with invite code', () => {
    const progress = getOnboardingProgress('intro', true);
    expect(progress.currentStep).toBe(1);
    expect(progress.totalSteps).toBe(10);
    expect(progress.mainStepLabel).toBe('Welcome');
  });

  it('groups weight and goalWeight into the same main step', () => {
    const weightProgress = getOnboardingProgress('weight', false);
    const goalWeightProgress = getOnboardingProgress('goalWeight', false);
    expect(weightProgress.currentStep).toBe(goalWeightProgress.currentStep);
    expect(weightProgress.mainStepLabel).toBe('Weight');
    expect(goalWeightProgress.mainStepLabel).toBe('Weight');
  });

  it('groups all body fat stages into one main step', () => {
    const bodyFatStages = [
      'bodyFatAsk',
      'bodyFatKnowHow',
      'bodyFatEstimateSex',
      'bodyFatVisualEstimate',
      'bodyFatHow',
      'bodyFatCurrent',
      'bodyFatGoal'
    ] as const;
    const steps = bodyFatStages.map((stage) => getOnboardingProgress(stage, false).currentStep);
    const uniqueSteps = [...new Set(steps)];
    expect(uniqueSteps.length).toBe(1);
    expect(getOnboardingProgress('bodyFatAsk', false).mainStepLabel).toBe('Body Composition');
  });

  it('groups contact stages (smsAsk, timezone, phone) into one main step', () => {
    const contactStages = ['smsAsk', 'timezone', 'phone'] as const;
    const steps = contactStages.map((stage) => getOnboardingProgress(stage, false).currentStep);
    const uniqueSteps = [...new Set(steps)];
    expect(uniqueSteps.length).toBe(1);
    expect(getOnboardingProgress('smsAsk', false).mainStepLabel).toBe('Contact');
  });

  it('skips trackingMode and coachConnection steps when invite code is present', () => {
    const withInvite = getOnboardingProgress('readyToSubmit', true);
    const withoutInvite = getOnboardingProgress('readyToSubmit', false);
    expect(withInvite.totalSteps).toBe(10);
    expect(withoutInvite.totalSteps).toBe(12);
  });

  it('reaches final step at readyToSubmit', () => {
    const progress = getOnboardingProgress('readyToSubmit', false);
    expect(progress.currentStep).toBe(progress.totalSteps);
    expect(progress.mainStepLabel).toBe('Confirm');
  });
});

describe('body fat visual estimate', () => {
  const withGender = { ...formWithVirtualCoach(), gender: 'm' };

  it('asks gender before body composition', () => {
    const height = advanceCoachOnboarding('height', `5'10`, formWithVirtualCoach(), coach);
    expect(height.next.stage).toBe('gender');

    const gender = advanceCoachOnboarding('gender', 'male', formWithVirtualCoach(), coach);
    expect(gender.formPatch).toEqual({ gender: 'm' });
    expect(gender.next.stage).toBe('activity');
  });

  it('opens visual estimate cards when the user does not know their number', () => {
    const result = advanceCoachOnboarding('bodyFatKnowHow', 'no', withGender, coach);
    expect(result.next.stage).toBe('bodyFatVisualEstimate');
    expect(result.next.assistantMessage).toContain('[VISUAL_ESTIMATE_CARDS:male]');
  });

  it('stays on visual estimate after invalid chat input so cards can stay visible', () => {
    const result = advanceCoachOnboarding('bodyFatVisualEstimate', 'idk', withGender, coach);
    expect(result.error).toBe('Tap one of the body type images, or skip.');
    expect(result.next.stage).toBe('bodyFatVisualEstimate');
    expect(result.next.assistantMessage).toContain('[VISUAL_ESTIMATE_CARDS:male]');
  });

  it('accepts a tapped silhouette midpoint', () => {
    const result = advanceCoachOnboarding('bodyFatVisualEstimate', '20', withGender, coach);
    expect(result.formPatch).toEqual({ bodyFat: '20' });
    expect(result.next.stage).toBe('bodyFatCurrent');
    expect(result.next.assistantMessage).toContain('20%');
  });
});
