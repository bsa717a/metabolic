import { prisma } from '../db/prisma.js';
import {
  getAiProvider,
  type ProgressPhotoAnalysisResult,
  type ProgressPhotoPose
} from './aiService.js';
import { isVirtualCoachId, VIRTUAL_COACH_PERSONA_PROMPTS, type VirtualCoachId } from '../data/virtualCoachPersonas.js';
import { listProgramMetricSnapshots, listProgressPhotoSets } from './programService.js';
import type { Role } from '@prisma/client';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

type PhotoSet = {
  id: string;
  date: string;
  frontUrl: string | null;
  sideUrl: string | null;
  backUrl: string | null;
};

type SnapshotRow = {
  id: string;
  date: string;
  values: Array<{ metricType: string; currentValue: number; unit: string }>;
};

function hasProgressPhotos(photoSet: PhotoSet) {
  return Boolean(photoSet.frontUrl || photoSet.sideUrl || photoSet.backUrl);
}

function firstAndLastSnapshotPhotoSets(
  snapshots: SnapshotRow[],
  photoSets: PhotoSet[]
): { first: PhotoSet; last: PhotoSet } | null {
  const photoByDate = new Map(photoSets.map((photoSet) => [photoSet.date, photoSet]));
  const chronological = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const withPhotos = chronological.flatMap((snapshot) => {
    const photoSet = photoByDate.get(snapshot.date);
    if (!photoSet || !hasProgressPhotos(photoSet)) return [];
    return [photoSet];
  });

  if (!withPhotos.length) return null;
  return { first: withPhotos[0], last: withPhotos[withPhotos.length - 1] };
}

function photoUrlForPose(photoSet: PhotoSet, pose: ProgressPhotoPose) {
  if (pose === 'front') return photoSet.frontUrl;
  if (pose === 'side') return photoSet.sideUrl;
  return photoSet.backUrl;
}

function formatMetricLine(values: Array<{ metricType: string; currentValue: number; unit: string }>) {
  const interesting = ['WEIGHT', 'WAIST', 'HIPS', 'CHEST', 'BODY_FAT'];
  return interesting
    .flatMap((type) => {
      const value = values.find((entry) => entry.metricType === type);
      if (!value) return [];
      const label = type.replace('_', ' ').toLowerCase();
      return [`${label}: ${value.currentValue} ${value.unit}`];
    })
    .join(', ');
}

async function downloadImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not download a progress photo for analysis.');
  }

  const mimeType = (response.headers.get('content-type') || '').split(';')[0]!.trim().toLowerCase() || 'image/jpeg';
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType) && !mimeType.startsWith('image/')) {
    throw new Error('Progress photos must be JPEG, PNG, or WebP images.');
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error('Progress photos must be 10 MB or smaller.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Progress photos must be 10 MB or smaller.');
  }

  const normalizedMime =
    SUPPORTED_IMAGE_TYPES.has(mimeType) ? mimeType : mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

  return { data: buffer.toString('base64'), mimeType: normalizedMime };
}

export type ProgressPhotoAnalysisResponse = ProgressPhotoAnalysisResult & {
  coachId: VirtualCoachId;
  pose: ProgressPhotoPose;
  beforeDate: string;
  afterDate: string;
};

export async function analyzeProgressPhotoComparison(
  user: { id: string; role: Role },
  input: { programId: string; pose: ProgressPhotoPose; landmarkSummary?: string | null }
): Promise<ProgressPhotoAnalysisResponse> {
  const photoSets = await listProgressPhotoSets(user, input.programId);
  const snapshotsRaw = await listProgramMetricSnapshots(user, input.programId);
  const snapshots: SnapshotRow[] = snapshotsRaw.map((snapshot) => ({
    id: snapshot.id,
    date: snapshot.date.toISOString().slice(0, 10),
    values: snapshot.values.map((value) => ({
      metricType: value.metricType,
      currentValue: Number(value.currentValue),
      unit: value.unit
    }))
  }));

  const comparison = firstAndLastSnapshotPhotoSets(snapshots, photoSets);
  if (!comparison) {
    throw new Error('Upload progress photos during check-ins to compare your transformation.');
  }
  if (comparison.first.id === comparison.last.id) {
    throw new Error('Add more check-in photos to see a before-and-after comparison.');
  }

  const beforeUrl = photoUrlForPose(comparison.first, input.pose);
  const afterUrl = photoUrlForPose(comparison.last, input.pose);
  if (!beforeUrl || !afterUrl) {
    throw new Error(`Both before and after ${input.pose} photos are required for analysis.`);
  }

  const program = await prisma.program.findUnique({
    where: { id: input.programId },
    select: { userId: true }
  });
  if (!program) throw new Error('Program not found');

  const owner = await prisma.user.findUnique({
    where: { id: program.userId },
    select: { selectedVirtualCoachId: true, firstName: true }
  });

  const coachId: VirtualCoachId =
    owner?.selectedVirtualCoachId && isVirtualCoachId(owner.selectedVirtualCoachId)
      ? owner.selectedVirtualCoachId
      : 'nora';
  const personaPrompt = VIRTUAL_COACH_PERSONA_PROMPTS[coachId];

  const beforeSnapshot = snapshots.find((snapshot) => snapshot.date === comparison.first.date);
  const afterSnapshot = snapshots.find((snapshot) => snapshot.date === comparison.last.date);
  const beforeMetrics = beforeSnapshot ? formatMetricLine(beforeSnapshot.values) : '';
  const afterMetrics = afterSnapshot ? formatMetricLine(afterSnapshot.values) : '';

  const metricsContext = [
    beforeMetrics ? `Before (${comparison.first.date}): ${beforeMetrics}` : `Before date: ${comparison.first.date}`,
    afterMetrics ? `After (${comparison.last.date}): ${afterMetrics}` : `After date: ${comparison.last.date}`
  ].join('\n');

  const [beforeImage, afterImage] = await Promise.all([downloadImage(beforeUrl), downloadImage(afterUrl)]);

  const analysis = await getAiProvider().analyzeProgressPhotos({
    pose: input.pose,
    personaPrompt,
    coachId,
    userFirstName: owner?.firstName?.trim() || 'there',
    metricsContext,
    beforeImage,
    afterImage,
    landmarkSummary: input.landmarkSummary ?? null
  });

  return {
    ...analysis,
    coachId,
    pose: input.pose,
    beforeDate: comparison.first.date,
    afterDate: comparison.last.date
  };
}
