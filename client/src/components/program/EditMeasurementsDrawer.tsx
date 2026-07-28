import { useEffect, useState } from 'react';
import type { ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { api, parseDateKey, toDateKey } from '../../services/api';
import { isFirebaseStorageConfigured } from '../../services/firebase';
import { uploadProgressPhoto, validateProgressPhotoFile, type ProgressPhotoSlot } from '../../services/progressPhotoStorage';
import {
  MEASUREMENT_LABELS,
  MEASUREMENT_METRIC_TYPES,
  type MeasurementMetricType
} from '../../utils/measurementUtils';
import { metricValue } from '../../utils/snapshotHistoryUtils';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { NumberInput } from '../ui/NumberInput';
import {
  emptyPhotoDraft,
  ProgressPhotoUploadField,
  type PhotoDraft
} from './ProgressPhotoUploadField';

type MeasurementDraft = Record<MeasurementMetricType, string>;

const PHOTO_SLOTS: Array<{ slot: ProgressPhotoSlot; label: string }> = [
  { slot: 'front', label: 'Front' },
  { slot: 'side', label: 'Side' },
  { slot: 'back', label: 'Back' }
];

function toDraft(snapshot?: ProgramMetricSnapshot | null): MeasurementDraft {
  return {
    WAIST: snapshot && metricValue(snapshot, 'WAIST') != null ? String(metricValue(snapshot, 'WAIST')) : '',
    HIPS: snapshot && metricValue(snapshot, 'HIPS') != null ? String(metricValue(snapshot, 'HIPS')) : '',
    CHEST: snapshot && metricValue(snapshot, 'CHEST') != null ? String(metricValue(snapshot, 'CHEST')) : ''
  };
}

function labelClassName() {
  return 'mb-1 block text-xs font-medium text-slate-500 dark:text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-app-border dark:bg-app-bg';
}

function formatSessionDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function EditMeasurementsDrawer({
  open,
  programId,
  sessionDate,
  snapshot,
  photoSet,
  onClose,
  onSaved
}: {
  open: boolean;
  programId: string;
  sessionDate?: string;
  snapshot?: ProgramMetricSnapshot | null;
  photoSet?: ProgressPhotoSet | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const resolvedDate = sessionDate ?? toDateKey(new Date());

  return (
    <Drawer open={open} title="Edit measurements" panelClassName="max-w-2xl" onClose={onClose}>
      {open && (
        <EditMeasurementsDrawerContent
          key={`${snapshot?.id ?? 'new'}:${resolvedDate}:${photoSet?.id ?? 'new'}`}
          programId={programId}
          sessionDate={resolvedDate}
          snapshot={snapshot ?? undefined}
          photoSet={photoSet}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Drawer>
  );
}

function EditMeasurementsDrawerContent({
  programId,
  sessionDate,
  snapshot,
  photoSet,
  onClose,
  onSaved
}: {
  programId: string;
  sessionDate: string;
  snapshot?: ProgramMetricSnapshot;
  photoSet?: ProgressPhotoSet | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() => toDraft(snapshot));
  const [photos, setPhotos] = useState<Record<ProgressPhotoSlot, PhotoDraft>>(() => ({
    front: emptyPhotoDraft(photoSet?.frontUrl ?? null),
    side: emptyPhotoDraft(photoSet?.sideUrl ?? null),
    back: emptyPhotoDraft(photoSet?.backUrl ?? null)
  }));
  const [objectUrls, setObjectUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [objectUrls]);

  function updateDraft(metricType: MeasurementMetricType, value: string) {
    setDraft((current) => ({ ...current, [metricType]: value }));
  }

  function selectPhoto(slot: ProgressPhotoSlot, file: File) {
    try {
      validateProgressPhotoFile(file);
      setPhotos((current) => {
        const previousPreview = current[slot].previewUrl;
        if (previousPreview?.startsWith('blob:')) {
          URL.revokeObjectURL(previousPreview);
          setObjectUrls((urls) => urls.filter((url) => url !== previousPreview));
        }
        const previewUrl = URL.createObjectURL(file);
        setObjectUrls((urls) => [...urls, previewUrl]);
        return {
          ...current,
          [slot]: {
            existingUrl: current[slot].existingUrl,
            file,
            previewUrl
          }
        };
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to use that photo');
    }
  }

  async function savePhotos() {
    if (!isFirebaseStorageConfigured) return null;

    const urls: Record<ProgressPhotoSlot, string | null> = {
      front: photos.front.existingUrl,
      side: photos.side.existingUrl,
      back: photos.back.existingUrl
    };

    for (const { slot } of PHOTO_SLOTS) {
      const photoDraft = photos[slot];
      if (photoDraft.file) {
        urls[slot] = await uploadProgressPhoto(programId, sessionDate, slot, photoDraft.file);
      }
    }

    if (!urls.front && !urls.side && !urls.back) return null;

    return api<ProgressPhotoSet>(`/api/programs/${programId}/progress-photos`, {
      method: 'POST',
      body: JSON.stringify({
        id: photoSet?.id,
        date: sessionDate,
        frontUrl: urls.front,
        sideUrl: urls.side,
        backUrl: urls.back
      })
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const measurementPayload = MEASUREMENT_METRIC_TYPES.flatMap((metricType) => {
        const raw = draft[metricType].trim();
        if (!raw) return [];
        const currentValue = Number(raw);
        if (!Number.isFinite(currentValue) || currentValue <= 0) {
          throw new Error(`Enter a valid number for ${MEASUREMENT_LABELS[metricType].toLowerCase()}.`);
        }
        return [{ metricType, currentValue, unit: 'in' }];
      });

      const photoResult = await savePhotos();

      if (!measurementPayload.length && !photoResult) {
        throw new Error('Enter at least one measurement or upload a progress photo.');
      }

      if (snapshot) {
        const preserved = snapshot.values
          .filter((value) => !MEASUREMENT_METRIC_TYPES.includes(value.metricType as MeasurementMetricType))
          .map((value) => ({
            metricType: value.metricType,
            currentValue: Number(value.currentValue),
            unit: value.unit
          }));

        await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots/${snapshot.id}`, {
          method: 'PATCH',
          body: JSON.stringify([...measurementPayload, ...preserved])
        });
      } else if (measurementPayload.length) {
        await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots`, {
          method: 'POST',
          body: JSON.stringify(measurementPayload)
        });
      } else {
        await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots`, {
          method: 'POST',
          body: JSON.stringify([])
        });
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save measurements');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500 dark:text-app-text-muted">
        Session on {formatSessionDate(sessionDate)}. Leave fields blank if you did not take that measurement this week.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {MEASUREMENT_METRIC_TYPES.map((metricType) => (
          <label key={metricType} className="block rounded-2xl border border-slate-200 p-4 dark:border-app-border">
            <span className={labelClassName()}>{MEASUREMENT_LABELS[metricType]}</span>
            <div className="flex items-center gap-2">
              <NumberInput
                className={inputClassName()}
                step="0.01"
                value={draft[metricType]}
                onChange={(value) => updateDraft(metricType, value)}
              />
              <span className="text-xs text-slate-500">in</span>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-app-border">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-app-text-muted">
          Progress photos
        </h3>
        {PHOTO_SLOTS.map(({ slot, label }) => (
          <ProgressPhotoUploadField
            key={slot}
            label={label}
            draft={photos[slot]}
            disabled={saving}
            onSelect={(file) => selectPhoto(slot, file)}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
