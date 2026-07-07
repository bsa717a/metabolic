import type { ProgramMetricSnapshot, ProgressPhotoSet } from '../types';
import type { ProgressPhotoSlot } from '../services/progressPhotoStorage';

export function hasProgressPhotos(photoSet: ProgressPhotoSet): boolean {
  return Boolean(photoSet.frontUrl || photoSet.sideUrl || photoSet.backUrl);
}

export function photoSetsByDate(photoSets: ProgressPhotoSet[]): Map<string, ProgressPhotoSet> {
  return new Map(photoSets.map((photoSet) => [photoSet.date, photoSet]));
}

/** First/last photo sets that belong to saved session snapshots (not orphan photo uploads). */
export function firstAndLastSnapshotPhotoSets(
  snapshots: ProgramMetricSnapshot[],
  photoSets: ProgressPhotoSet[]
): { first: ProgressPhotoSet; last: ProgressPhotoSet } | null {
  const photoByDate = photoSetsByDate(photoSets);
  const chronological = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  const withPhotos = chronological.flatMap((snapshot) => {
    const photoSet = photoByDate.get(snapshot.date);
    if (!photoSet || !hasProgressPhotos(photoSet)) return [];
    return [photoSet];
  });

  if (!withPhotos.length) return null;

  return { first: withPhotos[0], last: withPhotos[withPhotos.length - 1] };
}

export function firstAndLastPhotoSets(
  photoSets: ProgressPhotoSet[]
): { first: ProgressPhotoSet; last: ProgressPhotoSet } | null {
  const withPhotos = photoSets.filter(hasProgressPhotos);
  if (!withPhotos.length) return null;

  const sorted = [...withPhotos].sort((a, b) => a.date.localeCompare(b.date));
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

export function photoUrlForSlot(photoSet: ProgressPhotoSet, slot: ProgressPhotoSlot): string | null {
  if (slot === 'front') return photoSet.frontUrl;
  if (slot === 'side') return photoSet.sideUrl;
  return photoSet.backUrl;
}
