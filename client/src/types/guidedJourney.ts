export type GuidedJourneyEnrollmentStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export type GuidedDiscoveryProgressStatus =
  | 'INTRODUCED'
  | 'EXPERIENCING'
  | 'REFLECTION_UNLOCKED'
  | 'COMPLETED'
  | 'ABANDONED';

export type GuidedJourneyState = {
  enabled: boolean;
  userId: string;
  enrollment: {
    status: GuidedJourneyEnrollmentStatus;
    startedAt: string;
    pausedAt: string | null;
    resumedAt: string | null;
    completedAt: string | null;
    currentChapterId: string | null;
    currentDiscoveryId: string | null;
  } | null;
  invite: {
    headline: string;
    body: string;
    ctaLabel: string;
    sceneAssetId: string;
  };
  arrival: {
    message: string;
    ctaLabel: string;
    sceneAssetId: string;
  } | null;
  firstChapterId: string | null;
  activeDiscovery: {
    progress: DiscoveryProgressView | null;
    content: DiscoveryContentDto | null;
  } | null;
  trail: Array<{
    discoveryId: string;
    title: string;
    order: number;
    status: GuidedDiscoveryProgressStatus | null;
    completed: boolean;
  }>;
  skills: Array<{
    skillId: string;
    title: string;
    description: string;
    skillAssetId: string | null;
    earnedAt: string;
    sourceDiscoveryId: string;
  }>;
  wisdomStones: Array<{
    id: string;
    chapterId: string;
    discoveryId: string;
    reflectionText: string;
    createdAt: string;
  }>;
  remindersEnabled: boolean;
  selectedVirtualCoachId: string | null;
};

export type DiscoveryProgressView = {
  discoveryId: string;
  status: GuidedDiscoveryProgressStatus;
  introducedAt: string;
  experienceStartedAt: string | null;
  reflectionUnlockedAt: string | null;
  reflectedAt: string | null;
  reflectionText: string | null;
  coachResponse: string | null;
  completedAt: string | null;
  reflectionAvailable: boolean;
};

export type DiscoveryContentDto = {
  discovery: {
    id: string;
    chapterId: string;
    order: number;
    title: string;
    pillar: string;
    skillId: string;
    introductionContent: string;
    experienceInstructions: string;
    experienceLivingCopy: string;
    discoverCtaLabel: string;
    reflectionQuestion: string;
    reminderPrompt: string;
    sceneAssetIds: {
      discover: string;
      experiencing: string;
      reflection: string;
    };
  };
  skill: {
    id: string;
    title: string;
    description: string;
    pillar: string;
    skillAssetId: string;
  } | null;
  chapter: {
    id: string;
    levelId: string | null;
    order: number;
    title: string;
    subtitle: string;
    description: string;
    pillars: string[];
    beginDiscoveryCtaLabel: string;
    sceneAssetId: string;
    discoveryIds: string[];
  } | null;
};

export type ChapterState = {
  chapter: NonNullable<DiscoveryContentDto['chapter']>;
  firstDiscovery: { id: string; title: string; pillar: string } | null;
  enrollmentStatus: GuidedJourneyEnrollmentStatus | null;
};

export type DiscoveryStateResponse = {
  enrollmentStatus: GuidedJourneyEnrollmentStatus | null;
  progress: DiscoveryProgressView | null;
  content: DiscoveryContentDto;
  skillEarned: { skillId: string; earnedAt: string } | null;
  remindersEnabled: boolean;
  selectedVirtualCoachId: string | null;
};
