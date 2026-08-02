import type {
  JourneyChapterDef,
  JourneyCurriculumPack,
  JourneyDiscoveryDef,
  JourneySkillDef
} from '../types.js';
import { LEVEL1_CURRICULUM } from './level1.js';

const PACKS: JourneyCurriculumPack[] = [LEVEL1_CURRICULUM];

function allDiscoveries(): JourneyDiscoveryDef[] {
  return PACKS.flatMap((p) => p.discoveries);
}

function allChapters(): JourneyChapterDef[] {
  return PACKS.flatMap((p) => p.chapters);
}

function allSkills(): JourneySkillDef[] {
  return PACKS.flatMap((p) => p.skills);
}

export function listCurriculumPacks() {
  return PACKS;
}

export function getPrimaryPack(): JourneyCurriculumPack {
  return PACKS[0]!;
}

export function getChapter(chapterId: string): JourneyChapterDef | undefined {
  return allChapters().find((c) => c.id === chapterId);
}

export function getDiscovery(discoveryId: string): JourneyDiscoveryDef | undefined {
  return allDiscoveries().find((d) => d.id === discoveryId);
}

export function getSkill(skillId: string): JourneySkillDef | undefined {
  return allSkills().find((s) => s.id === skillId);
}

export function getChapterDiscoveries(chapterId: string): JourneyDiscoveryDef[] {
  const chapter = getChapter(chapterId);
  if (!chapter) return [];
  return chapter.discoveryIds
    .map((id) => getDiscovery(id))
    .filter((d): d is JourneyDiscoveryDef => Boolean(d))
    .sort((a, b) => a.order - b.order);
}

export function getFirstChapter(): JourneyChapterDef | undefined {
  return allChapters().sort((a, b) => a.order - b.order)[0];
}

export function chapterForLevelId(levelId: string): JourneyChapterDef | undefined {
  return allChapters().find((c) => c.levelId === levelId);
}
