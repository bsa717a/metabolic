/** Engineering-owned Guided Journey schema. Curriculum packs must conform. */

export type JourneyPillar =
  | 'AWARENESS'
  | 'NOURISHMENT'
  | 'MOVEMENT'
  | 'RECOVERY'
  | 'CONNECTION';

export type DiscoveryStage = 'DISCOVER' | 'EXPERIENCE' | 'REFLECT';

export type JourneySkillDef = {
  id: string;
  title: string;
  description: string;
  pillar: JourneyPillar;
  /** Maps via client journeyArt.ts */
  skillAssetId: string;
};

export type DiscoveryTimingConfig = {
  /** Hours lived with discovery before evening-hour unlock may apply */
  minExperienceHoursBeforeEveningUnlock: number;
  /** Local hour (0–23) when evening unlock becomes eligible */
  reflectionUnlockLocalHour: number;
  /** Absolute hours after experience start when reflection always unlocks */
  minExperienceHoursAbsolute: number;
  /** Local quiet hours for SMS prompts (inclusive start, exclusive end) */
  reminderLocalHourStart: number;
  reminderLocalHourEnd: number;
  maxRemindersPerDay: number;
};

export type JourneyDiscoveryDef = {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  pillar: JourneyPillar;
  skillId: string;
  introductionContent: string;
  experienceInstructions: string;
  experienceLivingCopy: string;
  discoverCtaLabel: string;
  reflectionQuestion: string;
  staticCoachResponse: string;
  reminderPrompt: string;
  timing: DiscoveryTimingConfig;
  sceneAssetIds: {
    discover: string;
    experiencing: string;
    reflection: string;
  };
};

export type JourneyChapterDef = {
  id: string;
  /** Related Level Up level id when bridged (e.g. level-1) */
  levelId: string | null;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  pillars: JourneyPillar[];
  beginDiscoveryCtaLabel: string;
  sceneAssetId: string;
  discoveryIds: string[];
};

export type JourneyCurriculumPack = {
  id: string;
  invite: {
    headline: string;
    body: string;
    ctaLabel: string;
    sceneAssetId: string;
  };
  /** One-time arrival beat after enrollment — optional */
  arrival?: {
    message: string;
    ctaLabel: string;
    sceneAssetId: string;
  };
  chapters: JourneyChapterDef[];
  discoveries: JourneyDiscoveryDef[];
  skills: JourneySkillDef[];
};
