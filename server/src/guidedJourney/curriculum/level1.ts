import type { JourneyCurriculumPack } from '../types.js';

/** Tommy-owned Level 1 curriculum pack — Becoming Aware / Observe Hunger. */
export const LEVEL1_CURRICULUM: JourneyCurriculumPack = {
  id: 'level-1-becoming-aware',
  invite: {
    headline: 'Your Journey is ready when you are.',
    body: 'An optional guided experience. You can keep using meals, exercise, and coaching without starting it.',
    ctaLabel: 'Begin My Journey',
    sceneAssetId: 'l1-valley-invite'
  },
  arrival: {
    message: 'Every meaningful change begins with a quiet step inward.',
    ctaLabel: 'Continue',
    sceneAssetId: 'l1-valley-arrival'
  },
  chapters: [
    {
      id: 'chapter-becoming-aware',
      levelId: 'level-1',
      order: 1,
      title: 'Becoming Aware',
      subtitle: 'Level 1',
      description:
        'This level is about learning to notice what your body has been telling you. You are not being asked to be perfect. You are learning to pay attention.',
      pillars: ['AWARENESS', 'NOURISHMENT', 'MOVEMENT', 'RECOVERY', 'CONNECTION'],
      beginDiscoveryCtaLabel: 'Begin Discovery',
      sceneAssetId: 'l1-valley-intro',
      discoveryIds: ['observe-hunger']
    }
  ],
  discoveries: [
    {
      id: 'observe-hunger',
      chapterId: 'chapter-becoming-aware',
      order: 1,
      title: 'Observe Hunger',
      pillar: 'AWARENESS',
      skillId: 'hunger-awareness',
      introductionContent:
        'For years, your body has been talking to you.\nMost of us were never taught how to listen.\nToday, do not change what you eat.\nEvery time you think you are hungry, pause and ask:\nWhere do I feel this in my body?',
      experienceInstructions: 'Sit with this today. Notice hunger without changing what you eat.',
      experienceLivingCopy: 'Sit with this today.',
      discoverCtaLabel: 'I’ll Notice Today',
      reflectionQuestion: 'What surprised you today?',
      staticCoachResponse:
        'That is an important discovery.\nToday you practiced noticing without judging.\nAwareness is the first step toward understanding what your body needs.',
      reminderPrompt: 'Pause for ten seconds. Where do you feel hunger right now?',
      timing: {
        minExperienceHoursBeforeEveningUnlock: 2,
        reflectionUnlockLocalHour: 18,
        minExperienceHoursAbsolute: 6,
        reminderLocalHourStart: 10,
        reminderLocalHourEnd: 16,
        maxRemindersPerDay: 2
      },
      sceneAssetIds: {
        discover: 'l1-valley-intro',
        experiencing: 'l1-trail-experiencing',
        reflection: 'l1-trail-reflection'
      }
    }
  ],
  skills: [
    {
      id: 'hunger-awareness',
      title: 'Hunger Awareness',
      description: 'You practiced noticing hunger in your body without judgment.',
      pillar: 'AWARENESS',
      skillAssetId: 'skill-hunger-awareness'
    }
  ]
};
