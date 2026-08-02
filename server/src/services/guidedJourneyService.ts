import {
  GuidedDiscoveryProgressStatus,
  GuidedJourneyEnrollmentStatus,
  GuidedJourneyEventType,
  type GuidedDiscoveryProgress
} from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { getGuidedJourneyEnabled } from './appSettings.js';
import {
  getChapter,
  getChapterDiscoveries,
  getDiscovery,
  getFirstChapter,
  getPrimaryPack,
  getSkill
} from '../guidedJourney/curriculum/index.js';
import { isReflectionUnlocked } from '../guidedJourney/unlockTiming.js';
import { runProgressionEvaluation } from '../gamification/progressionEngine.js';
import { getAiProvider } from './aiService.js';

async function recordEvent(
  userId: string,
  type: GuidedJourneyEventType,
  data?: { chapterId?: string; discoveryId?: string; skillId?: string; metadata?: Record<string, unknown> }
) {
  await prisma.guidedJourneyEvent.create({
    data: {
      userId,
      type,
      chapterId: data?.chapterId,
      discoveryId: data?.discoveryId,
      skillId: data?.skillId,
      metadata: data?.metadata ? (data.metadata as object) : undefined
    }
  });
}

export async function isGuidedJourneyFeatureEnabled() {
  return getGuidedJourneyEnabled(prisma);
}

async function assertGuidedJourneyEnabled() {
  if (!(await isGuidedJourneyFeatureEnabled())) {
    throw Object.assign(new Error('Guided Journey is not enabled'), { statusCode: 403 });
  }
}

async function assertEnrollmentMutable(userId: string) {
  const enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  if (!enrollment) {
    throw Object.assign(new Error('Journey not started'), { statusCode: 400 });
  }
  if (enrollment.status === GuidedJourneyEnrollmentStatus.PAUSED) {
    throw Object.assign(new Error('Journey is paused'), { statusCode: 400 });
  }
  return enrollment;
}

async function getUserTimezone(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, guidedJourneyRemindersEnabled: true, selectedVirtualCoachId: true }
  });
  return user;
}

function serializeDiscoveryProgress(progress: GuidedDiscoveryProgress | null, timeZone: string | null) {
  if (!progress) return null;
  const discovery = getDiscovery(progress.discoveryId);
  let status = progress.status;
  let reflectionUnlockedAt = progress.reflectionUnlockedAt;

  if (
    discovery &&
    (status === GuidedDiscoveryProgressStatus.EXPERIENCING ||
      status === GuidedDiscoveryProgressStatus.REFLECTION_UNLOCKED) &&
    isReflectionUnlocked({
      experienceStartedAt: progress.experienceStartedAt,
      timing: discovery.timing,
      timeZone
    })
  ) {
    status = GuidedDiscoveryProgressStatus.REFLECTION_UNLOCKED;
  }

  return {
    discoveryId: progress.discoveryId,
    status,
    introducedAt: progress.introducedAt.toISOString(),
    experienceStartedAt: progress.experienceStartedAt?.toISOString() ?? null,
    reflectionUnlockedAt: reflectionUnlockedAt?.toISOString() ?? null,
    reflectedAt: progress.reflectedAt?.toISOString() ?? null,
    reflectionText: progress.reflectionText,
    coachResponse: progress.coachResponse,
    completedAt: progress.completedAt?.toISOString() ?? null,
    reflectionAvailable:
      status === GuidedDiscoveryProgressStatus.REFLECTION_UNLOCKED ||
      status === GuidedDiscoveryProgressStatus.COMPLETED
  };
}

async function maybeMarkReflectionUnlocked(progress: GuidedDiscoveryProgress, timeZone: string | null) {
  const discovery = getDiscovery(progress.discoveryId);
  if (!discovery) return progress;
  if (progress.status !== GuidedDiscoveryProgressStatus.EXPERIENCING) return progress;
  if (
    !isReflectionUnlocked({
      experienceStartedAt: progress.experienceStartedAt,
      timing: discovery.timing,
      timeZone
    })
  ) {
    return progress;
  }

  const updated = await prisma.guidedDiscoveryProgress.update({
    where: { id: progress.id },
    data: {
      status: GuidedDiscoveryProgressStatus.REFLECTION_UNLOCKED,
      reflectionUnlockedAt: progress.reflectionUnlockedAt ?? new Date()
    }
  });
  if (!progress.reflectionUnlockedAt) {
    await recordEvent(progress.userId, GuidedJourneyEventType.REFLECTION_UNLOCKED, {
      discoveryId: progress.discoveryId,
      chapterId: discovery.chapterId
    });
  }
  return updated;
}

function contentDtoForDiscovery(discoveryId: string) {
  const discovery = getDiscovery(discoveryId);
  if (!discovery) return null;
  const skill = getSkill(discovery.skillId);
  const chapter = getChapter(discovery.chapterId);
  return {
    discovery: {
      id: discovery.id,
      chapterId: discovery.chapterId,
      order: discovery.order,
      title: discovery.title,
      pillar: discovery.pillar,
      skillId: discovery.skillId,
      introductionContent: discovery.introductionContent,
      experienceInstructions: discovery.experienceInstructions,
      experienceLivingCopy: discovery.experienceLivingCopy,
      discoverCtaLabel: discovery.discoverCtaLabel,
      reflectionQuestion: discovery.reflectionQuestion,
      reminderPrompt: discovery.reminderPrompt,
      sceneAssetIds: discovery.sceneAssetIds
    },
    skill: skill
      ? {
          id: skill.id,
          title: skill.title,
          description: skill.description,
          pillar: skill.pillar,
          skillAssetId: skill.skillAssetId
        }
      : null,
    chapter: chapter
      ? {
          id: chapter.id,
          levelId: chapter.levelId,
          order: chapter.order,
          title: chapter.title,
          subtitle: chapter.subtitle,
          description: chapter.description,
          pillars: chapter.pillars,
          beginDiscoveryCtaLabel: chapter.beginDiscoveryCtaLabel,
          sceneAssetId: chapter.sceneAssetId,
          discoveryIds: chapter.discoveryIds
        }
      : null
  };
}

export async function getGuidedJourneyState(userId: string) {
  const enabled = await isGuidedJourneyFeatureEnabled();
  const pack = getPrimaryPack();
  const user = await getUserTimezone(userId);
  const enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });

  let activeProgress: GuidedDiscoveryProgress | null = null;
  if (enrollment?.currentDiscoveryId) {
    activeProgress = await prisma.guidedDiscoveryProgress.findUnique({
      where: { userId_discoveryId: { userId, discoveryId: enrollment.currentDiscoveryId } }
    });
    if (activeProgress) {
      activeProgress = await maybeMarkReflectionUnlocked(activeProgress, user?.timezone ?? null);
    }
  }

  const skills = await prisma.userGuidedJourneySkill.findMany({
    where: { userId },
    orderBy: { earnedAt: 'desc' }
  });
  const stones = await prisma.guidedWisdomStone.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  const firstChapter = getFirstChapter();
  const chapterDiscoveries = firstChapter ? getChapterDiscoveries(firstChapter.id) : [];
  const trail = await Promise.all(
    chapterDiscoveries.map(async (d) => {
      const p = await prisma.guidedDiscoveryProgress.findUnique({
        where: { userId_discoveryId: { userId, discoveryId: d.id } }
      });
      return {
        discoveryId: d.id,
        title: d.title,
        order: d.order,
        status: p?.status ?? null,
        completed: p?.status === GuidedDiscoveryProgressStatus.COMPLETED
      };
    })
  );

  return {
    enabled,
    userId,
    enrollment: enrollment
      ? {
          status: enrollment.status,
          startedAt: enrollment.startedAt.toISOString(),
          pausedAt: enrollment.pausedAt?.toISOString() ?? null,
          resumedAt: enrollment.resumedAt?.toISOString() ?? null,
          completedAt: enrollment.completedAt?.toISOString() ?? null,
          currentChapterId: enrollment.currentChapterId,
          currentDiscoveryId: enrollment.currentDiscoveryId
        }
      : null,
    invite: pack.invite,
    arrival: pack.arrival ?? null,
    firstChapterId: firstChapter?.id ?? null,
    activeDiscovery: activeProgress
      ? {
          progress: serializeDiscoveryProgress(activeProgress, user?.timezone ?? null),
          content: contentDtoForDiscovery(activeProgress.discoveryId)
        }
      : null,
    trail,
    skills: skills.map((s) => {
      const def = getSkill(s.skillId);
      return {
        skillId: s.skillId,
        title: def?.title ?? s.skillId,
        description: def?.description ?? '',
        skillAssetId: def?.skillAssetId ?? null,
        earnedAt: s.earnedAt.toISOString(),
        sourceDiscoveryId: s.sourceDiscoveryId
      };
    }),
    wisdomStones: stones.map((st) => ({
      id: st.id,
      chapterId: st.chapterId,
      discoveryId: st.discoveryId,
      reflectionText: st.reflectionText,
      createdAt: st.createdAt.toISOString()
    })),
    remindersEnabled: user?.guidedJourneyRemindersEnabled ?? true,
    selectedVirtualCoachId: user?.selectedVirtualCoachId ?? null
  };
}

export async function trackInvitationViewed(userId: string) {
  await recordEvent(userId, GuidedJourneyEventType.INVITATION_VIEWED);
  return { ok: true };
}

export async function startGuidedJourney(userId: string) {
  await assertGuidedJourneyEnabled();

  const existing = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  if (existing) {
    return getGuidedJourneyState(userId);
  }

  const chapter = getFirstChapter();
  if (!chapter) {
    throw Object.assign(new Error('No journey curriculum available'), { statusCode: 500 });
  }

  await prisma.guidedJourneyEnrollment.create({
    data: {
      userId,
      status: GuidedJourneyEnrollmentStatus.ACTIVE,
      currentChapterId: chapter.id,
      currentDiscoveryId: null
    }
  });
  await recordEvent(userId, GuidedJourneyEventType.JOURNEY_STARTED, { chapterId: chapter.id });
  return getGuidedJourneyState(userId);
}

export async function pauseGuidedJourney(userId: string) {
  await assertGuidedJourneyEnabled();
  const enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  if (!enrollment) {
    throw Object.assign(new Error('Journey not started'), { statusCode: 404 });
  }
  await prisma.guidedJourneyEnrollment.update({
    where: { userId },
    data: { status: GuidedJourneyEnrollmentStatus.PAUSED, pausedAt: new Date() }
  });
  await recordEvent(userId, GuidedJourneyEventType.JOURNEY_PAUSED, {
    chapterId: enrollment.currentChapterId ?? undefined,
    discoveryId: enrollment.currentDiscoveryId ?? undefined
  });
  return getGuidedJourneyState(userId);
}

export async function resumeGuidedJourney(userId: string) {
  await assertGuidedJourneyEnabled();
  const enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  if (!enrollment) {
    throw Object.assign(new Error('Journey not started'), { statusCode: 404 });
  }
  await prisma.guidedJourneyEnrollment.update({
    where: { userId },
    data: { status: GuidedJourneyEnrollmentStatus.ACTIVE, resumedAt: new Date(), pausedAt: null }
  });
  await recordEvent(userId, GuidedJourneyEventType.JOURNEY_RESUMED, {
    chapterId: enrollment.currentChapterId ?? undefined,
    discoveryId: enrollment.currentDiscoveryId ?? undefined
  });
  return getGuidedJourneyState(userId);
}

export async function getChapterState(userId: string, chapterId: string) {
  await assertGuidedJourneyEnabled();
  const chapter = getChapter(chapterId);
  if (!chapter) {
    throw Object.assign(new Error('Chapter not found'), { statusCode: 404 });
  }
  const enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  const discoveries = getChapterDiscoveries(chapterId);
  const firstDiscovery = discoveries[0] ?? null;

  return {
    chapter: {
      id: chapter.id,
      levelId: chapter.levelId,
      order: chapter.order,
      title: chapter.title,
      subtitle: chapter.subtitle,
      description: chapter.description,
      pillars: chapter.pillars,
      beginDiscoveryCtaLabel: chapter.beginDiscoveryCtaLabel,
      sceneAssetId: chapter.sceneAssetId,
      discoveryIds: chapter.discoveryIds
    },
    firstDiscovery: firstDiscovery
      ? {
          id: firstDiscovery.id,
          title: firstDiscovery.title,
          pillar: firstDiscovery.pillar
        }
      : null,
    enrollmentStatus: enrollment?.status ?? null
  };
}

export async function beginDiscovery(userId: string, discoveryId: string) {
  await assertGuidedJourneyEnabled();
  const discovery = getDiscovery(discoveryId);
  if (!discovery) {
    throw Object.assign(new Error('Discovery not found'), { statusCode: 404 });
  }

  let enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  if (!enrollment) {
    await startGuidedJourney(userId);
    enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  }
  if (!enrollment || enrollment.status === GuidedJourneyEnrollmentStatus.PAUSED) {
    throw Object.assign(new Error('Journey is paused or missing'), { statusCode: 400 });
  }

  const progress = await prisma.guidedDiscoveryProgress.upsert({
    where: { userId_discoveryId: { userId, discoveryId } },
    create: {
      userId,
      discoveryId,
      status: GuidedDiscoveryProgressStatus.INTRODUCED,
      introducedAt: new Date()
    },
    update: {}
  });

  await prisma.guidedJourneyEnrollment.update({
    where: { userId },
    data: { currentChapterId: discovery.chapterId, currentDiscoveryId: discoveryId }
  });

  if (progress.status === GuidedDiscoveryProgressStatus.INTRODUCED) {
    await recordEvent(userId, GuidedJourneyEventType.DISCOVERY_INTRODUCED, {
      chapterId: discovery.chapterId,
      discoveryId
    });
  }

  return getDiscoveryState(userId, discoveryId);
}

export async function startExperience(userId: string, discoveryId: string) {
  await assertGuidedJourneyEnabled();
  await assertEnrollmentMutable(userId);

  const discovery = getDiscovery(discoveryId);
  if (!discovery) {
    throw Object.assign(new Error('Discovery not found'), { statusCode: 404 });
  }

  const existing = await prisma.guidedDiscoveryProgress.findUnique({
    where: { userId_discoveryId: { userId, discoveryId } }
  });
  if (!existing) {
    throw Object.assign(new Error('Discovery not introduced'), { statusCode: 400 });
  }
  if (
    existing.status === GuidedDiscoveryProgressStatus.COMPLETED ||
    existing.status === GuidedDiscoveryProgressStatus.ABANDONED
  ) {
    return getDiscoveryState(userId, discoveryId);
  }

  if (!existing.experienceStartedAt) {
    await prisma.guidedDiscoveryProgress.update({
      where: { id: existing.id },
      data: {
        status: GuidedDiscoveryProgressStatus.EXPERIENCING,
        experienceStartedAt: new Date()
      }
    });
    await recordEvent(userId, GuidedJourneyEventType.EXPERIENCE_STARTED, {
      chapterId: discovery.chapterId,
      discoveryId
    });
  }

  return getDiscoveryState(userId, discoveryId);
}

export async function getDiscoveryState(userId: string, discoveryId: string) {
  await assertGuidedJourneyEnabled();
  const content = contentDtoForDiscovery(discoveryId);
  if (!content) {
    throw Object.assign(new Error('Discovery not found'), { statusCode: 404 });
  }
  const user = await getUserTimezone(userId);
  let progress = await prisma.guidedDiscoveryProgress.findUnique({
    where: { userId_discoveryId: { userId, discoveryId } }
  });
  if (progress) {
    progress = await maybeMarkReflectionUnlocked(progress, user?.timezone ?? null);
  }

  const enrollment = await prisma.guidedJourneyEnrollment.findUnique({ where: { userId } });
  const skillEarned = content.skill
    ? await prisma.userGuidedJourneySkill.findUnique({
        where: { userId_skillId: { userId, skillId: content.skill.id } }
      })
    : null;

  return {
    enrollmentStatus: enrollment?.status ?? null,
    progress: serializeDiscoveryProgress(progress, user?.timezone ?? null),
    content,
    skillEarned: skillEarned
      ? {
          skillId: skillEarned.skillId,
          earnedAt: skillEarned.earnedAt.toISOString()
        }
      : null,
    remindersEnabled: user?.guidedJourneyRemindersEnabled ?? true,
    selectedVirtualCoachId: user?.selectedVirtualCoachId ?? null
  };
}

async function generateCoachResponse(_userId: string, discoveryId: string, reflectionText: string) {
  const discovery = getDiscovery(discoveryId);
  const fallback = discovery?.staticCoachResponse ?? 'Thank you for reflecting. Awareness grows with practice.';

  try {
    const provider = getAiProvider();
    const prompt = `The user completed a guided journey reflection for "${discovery?.title ?? discoveryId}".
Reflection question: ${discovery?.reflectionQuestion ?? ''}
User reflection: ${reflectionText}

Respond in 2–4 short calm sentences as their Metabolic coach. No emojis. No pressure. Affirm noticing without judgment.`;
    const text = await Promise.race([
      provider.chat([{ role: 'user', content: prompt }], 'Guided journey reflection response.'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);
    if (typeof text === 'string' && text.trim()) return text.trim();
  } catch {
    // static fallback
  }
  return fallback;
}

export async function submitReflection(userId: string, discoveryId: string, reflectionText: string) {
  await assertGuidedJourneyEnabled();
  await assertEnrollmentMutable(userId);

  const discovery = getDiscovery(discoveryId);
  if (!discovery) {
    throw Object.assign(new Error('Discovery not found'), { statusCode: 404 });
  }

  const user = await getUserTimezone(userId);
  let progress = await prisma.guidedDiscoveryProgress.findUnique({
    where: { userId_discoveryId: { userId, discoveryId } }
  });
  if (!progress) {
    throw Object.assign(new Error('Discovery not started'), { statusCode: 400 });
  }
  progress = await maybeMarkReflectionUnlocked(progress, user?.timezone ?? null);

  const unlocked =
    progress.status === GuidedDiscoveryProgressStatus.REFLECTION_UNLOCKED ||
    progress.status === GuidedDiscoveryProgressStatus.COMPLETED ||
    isReflectionUnlocked({
      experienceStartedAt: progress.experienceStartedAt,
      timing: discovery.timing,
      timeZone: user?.timezone
    });

  if (!unlocked) {
    throw Object.assign(new Error('Reflection is not available yet. Sit with this discovery a little longer.'), {
      statusCode: 400
    });
  }

  const trimmed = reflectionText.trim();
  if (!trimmed) {
    throw Object.assign(new Error('Reflection text is required'), { statusCode: 400 });
  }

  // Already completed: ensure side effects exist (repair partial failures), then return.
  if (progress.status === GuidedDiscoveryProgressStatus.COMPLETED) {
    await ensureReflectionSideEffects(userId, discoveryId, discovery.chapterId, discovery.skillId, {
      reflectionText: progress.reflectionText ?? trimmed,
      completedAt: progress.completedAt ?? new Date()
    });
    await runProgressionEvaluation(userId);
    return getDiscoveryState(userId, discoveryId);
  }

  const coachResponse = await generateCoachResponse(userId, discoveryId, trimmed);
  const now = new Date();
  const skill = getSkill(discovery.skillId);
  const chapterDiscoveries = getChapterDiscoveries(discovery.chapterId);

  await prisma.$transaction(async (tx) => {
    await tx.guidedDiscoveryProgress.update({
      where: { id: progress.id },
      data: {
        status: GuidedDiscoveryProgressStatus.COMPLETED,
        reflectionText: trimmed,
        coachResponse,
        reflectedAt: now,
        completedAt: now,
        reflectionUnlockedAt: progress.reflectionUnlockedAt ?? now
      }
    });

    const existingStone = await tx.guidedWisdomStone.findFirst({
      where: { userId, discoveryId }
    });
    if (!existingStone) {
      await tx.guidedWisdomStone.create({
        data: {
          userId,
          chapterId: discovery.chapterId,
          discoveryId,
          reflectionText: trimmed
        }
      });
    }

    if (skill) {
      await tx.userGuidedJourneySkill.upsert({
        where: { userId_skillId: { userId, skillId: skill.id } },
        create: {
          userId,
          skillId: skill.id,
          sourceDiscoveryId: discoveryId,
          earnedAt: now
        },
        update: {}
      });
    }

    const completedCount = await tx.guidedDiscoveryProgress.count({
      where: {
        userId,
        discoveryId: { in: chapterDiscoveries.map((d) => d.id) },
        status: GuidedDiscoveryProgressStatus.COMPLETED
      }
    });
    if (completedCount >= chapterDiscoveries.length) {
      await tx.guidedJourneyEnrollment.update({
        where: { userId },
        data: {
          status: GuidedJourneyEnrollmentStatus.COMPLETED,
          completedAt: now,
          currentDiscoveryId: discoveryId
        }
      });
    }

    await tx.guidedJourneyEvent.create({
      data: {
        userId,
        type: GuidedJourneyEventType.REFLECTION_SUBMITTED,
        chapterId: discovery.chapterId,
        discoveryId
      }
    });
    if (skill) {
      await tx.guidedJourneyEvent.create({
        data: {
          userId,
          type: GuidedJourneyEventType.SKILL_EARNED,
          chapterId: discovery.chapterId,
          discoveryId,
          skillId: skill.id
        }
      });
    }
  });

  await runProgressionEvaluation(userId);

  return getDiscoveryState(userId, discoveryId);
}

async function ensureReflectionSideEffects(
  userId: string,
  discoveryId: string,
  chapterId: string,
  skillId: string,
  data: { reflectionText: string; completedAt: Date }
) {
  const existingStone = await prisma.guidedWisdomStone.findFirst({
    where: { userId, discoveryId }
  });
  if (!existingStone) {
    await prisma.guidedWisdomStone.create({
      data: {
        userId,
        chapterId,
        discoveryId,
        reflectionText: data.reflectionText
      }
    });
  }

  const skill = getSkill(skillId);
  if (skill) {
    await prisma.userGuidedJourneySkill.upsert({
      where: { userId_skillId: { userId, skillId: skill.id } },
      create: {
        userId,
        skillId: skill.id,
        sourceDiscoveryId: discoveryId,
        earnedAt: data.completedAt
      },
      update: {}
    });
  }
}

export async function setGuidedJourneyReminders(userId: string, enabled: boolean) {
  await assertGuidedJourneyEnabled();
  await prisma.user.update({
    where: { id: userId },
    data: { guidedJourneyRemindersEnabled: enabled }
  });
  await recordEvent(userId, GuidedJourneyEventType.REMINDER_INTERACTED, {
    metadata: { enabled }
  });
  return { remindersEnabled: enabled };
}

export async function getCoachGuidedJourneySummary(userId: string, includeReflectionText: boolean) {
  const state = await getGuidedJourneyState(userId);
  return {
    enabled: state.enabled,
    enrollment: state.enrollment,
    activeDiscovery: state.activeDiscovery
      ? {
          discoveryId: state.activeDiscovery.progress?.discoveryId,
          title: state.activeDiscovery.content?.discovery.title,
          status: state.activeDiscovery.progress?.status,
          reflected: Boolean(state.activeDiscovery.progress?.reflectedAt),
          reflectionText: includeReflectionText
            ? state.activeDiscovery.progress?.reflectionText ?? null
            : undefined
        }
      : null,
    skills: state.skills,
    wisdomStoneCount: state.wisdomStones.length,
    wisdomStones: includeReflectionText
      ? state.wisdomStones
      : state.wisdomStones.map((s) => ({
          id: s.id,
          chapterId: s.chapterId,
          discoveryId: s.discoveryId,
          createdAt: s.createdAt
        }))
  };
}

/** Used by SMS tick — active experiencing discoveries for reminder candidates. */
export async function listActiveDiscoveryReminderCandidates(now = new Date()) {
  if (!(await isGuidedJourneyFeatureEnabled())) return [];

  const enrollments = await prisma.guidedJourneyEnrollment.findMany({
    where: {
      status: GuidedJourneyEnrollmentStatus.ACTIVE,
      currentDiscoveryId: { not: null }
    },
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          timezone: true,
          smsOptedOut: true,
          guidedJourneyRemindersEnabled: true
        }
      }
    }
  });

  const candidates: Array<{
    userId: string;
    phone: string;
    timezone: string | null;
    discoveryId: string;
    prompt: string;
    maxRemindersPerDay: number;
    dateKey: string;
  }> = [];

  for (const enrollment of enrollments) {
    const user = enrollment.user;
    if (!user.phone || user.smsOptedOut || !user.guidedJourneyRemindersEnabled) continue;
    const discoveryId = enrollment.currentDiscoveryId!;
    const discovery = getDiscovery(discoveryId);
    if (!discovery) continue;

    const progress = await prisma.guidedDiscoveryProgress.findUnique({
      where: { userId_discoveryId: { userId: user.id, discoveryId } }
    });
    if (!progress || progress.status !== GuidedDiscoveryProgressStatus.EXPERIENCING) continue;
    if (!progress.experienceStartedAt) continue;

    const { isReminderWindowOpen } = await import('../guidedJourney/unlockTiming.js');
    if (
      !isReminderWindowOpen({
        timing: discovery.timing,
        timeZone: user.timezone,
        now
      })
    ) {
      continue;
    }

    const { localTimeParts } = await import('../utils/dates.js');
    const { dateKey } = localTimeParts(user.timezone?.trim() || 'UTC', now);

    candidates.push({
      userId: user.id,
      phone: user.phone,
      timezone: user.timezone,
      discoveryId,
      prompt: discovery.reminderPrompt,
      maxRemindersPerDay: discovery.timing.maxRemindersPerDay,
      dateKey
    });
  }

  return candidates;
}
