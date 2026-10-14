import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft } from 'lucide-react';
import type { ProgramMetric, ProgramMetricSnapshot, ProgressPhotoSet } from '../../types';
import { api, dateKeyInTimeZone, parseDateKey } from '../../services/api';
import { checkInDateError } from '../../utils/checkInDate';
import { isFirebaseStorageConfigured } from '../../services/firebase';
import { uploadProgressPhoto, validateProgressPhotoFile, type ProgressPhotoSlot } from '../../services/progressPhotoStorage';
import {
  MEASUREMENT_LABELS,
  MEASUREMENT_METRIC_TYPES,
  type MeasurementMetricType
} from '../../utils/measurementUtils';
import { BLUEPRINT_JOURNEY_METRICS, type JourneyMetricType } from '../../utils/journeyDialUtils';
import { metricValue, metricsWithSnapshotCurrent } from '../../utils/snapshotHistoryUtils';
import { NumberInput } from '../ui/NumberInput';
import {
  emptyPhotoDraft,
  ProgressPhotoUploadField,
  type PhotoDraft
} from './ProgressPhotoUploadField';

const PRIMARY_METRIC_TYPES: JourneyMetricType[] = ['WEIGHT', 'BODY_FAT'];
const OTHER_METRIC_TYPES: JourneyMetricType[] = ['CALORIES', 'PROTEIN', 'LEAN_TISSUE_MASS', 'FAT_MASS'];

const PHOTO_SLOTS: Array<{ slot: ProgressPhotoSlot; label: string }> = [
  { slot: 'front', label: 'Front' },
  { slot: 'side', label: 'Side' },
  { slot: 'back', label: 'Back' }
];

const METRIC_LABELS = new Map(BLUEPRINT_JOURNEY_METRICS.map((metric) => [metric.type, metric.label]));

type MetricDraft = {
  id: string;
  metricType: JourneyMetricType;
  label: string;
  unit: string;
  startValue: number;
  goalValue: number;
  currentValue: string;
};

type MeasurementDraft = Record<MeasurementMetricType, string>;

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

function toMetricDrafts(metrics: ProgramMetric[], types: JourneyMetricType[]): MetricDraft[] {
  const byType = new Map(metrics.map((metric) => [metric.metricType, metric]));

  return types.flatMap((type) => {
    const metric = byType.get(type);
    if (!metric) return [];

    return [
      {
        id: metric.id,
        metricType: type,
        label: METRIC_LABELS.get(type) ?? type,
        unit: metric.unit,
        startValue: Number(metric.startValue),
        goalValue: Number(metric.goalValue),
        currentValue: String(Number(metric.currentValue))
      }
    ];
  });
}

function toMeasurementDraft(snapshot?: ProgramMetricSnapshot | null): MeasurementDraft {
  return {
    WAIST: snapshot && metricValue(snapshot, 'WAIST') != null ? String(metricValue(snapshot, 'WAIST')) : '',
    HIPS: snapshot && metricValue(snapshot, 'HIPS') != null ? String(metricValue(snapshot, 'HIPS')) : '',
    CHEST: snapshot && metricValue(snapshot, 'CHEST') != null ? String(metricValue(snapshot, 'CHEST')) : ''
  };
}

function MetricFields({
  draft,
  onChange
}: {
  draft: MetricDraft[];
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {draft.map((metric) => (
        <label key={metric.id} className="block rounded-2xl border border-slate-200 p-4 dark:border-app-border">
          <span className={labelClassName()}>{metric.label}</span>
          <div className="flex items-center gap-2">
            <NumberInput
              className={inputClassName()}
              step="0.01"
              value={metric.currentValue}
              onChange={(value) => onChange(metric.id, value)}
            />
            <span className="text-xs text-slate-500">{metric.unit}</span>
          </div>
        </label>
      ))}
    </div>
  );
}

export function BlueprintCheckInModal({
  open,
  programId,
  metrics,
  snapshot,
  photoSet,
  snapshots = [],
  progressPhotos = [],
  timeZone,
  onClose,
  onSaved
}: {
  open: boolean;
  programId: string;
  metrics: ProgramMetric[];
  snapshot?: ProgramMetricSnapshot | null;
  photoSet?: ProgressPhotoSet | null;
  snapshots?: ProgramMetricSnapshot[];
  progressPhotos?: ProgressPhotoSet[];
  timeZone?: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const today = dateKeyInTimeZone(timeZone);
  const openedDate = snapshot?.date ?? today;
  const openKey = open ? `${programId}:${openedDate}:${snapshot?.id ?? 'new'}` : null;

  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(openedDate);
  const [dateNote, setDateNote] = useState('');
  const [primaryDraft, setPrimaryDraft] = useState<MetricDraft[]>([]);
  const [otherDraft, setOtherDraft] = useState<MetricDraft[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementDraft>(() => toMeasurementDraft(snapshot));
  const [photos, setPhotos] = useState<Record<ProgressPhotoSlot, PhotoDraft>>(() => ({
    front: emptyPhotoDraft(photoSet?.frontUrl ?? null),
    side: emptyPhotoDraft(photoSet?.sideUrl ?? null),
    back: emptyPhotoDraft(photoSet?.backUrl ?? null)
  }));
  const [objectUrls, setObjectUrls] = useState<string[]>([]);
  const [photosExpanded, setPhotosExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isToday = sessionDate === today;

  function snapshotForDate(date: string) {
    return snapshots.find((row) => row.date === date) ?? (snapshot?.date === date ? snapshot : null);
  }

  function photosForDate(date: string) {
    return progressPhotos.find((row) => row.date === date) ?? (photoSet?.date === date ? photoSet : null);
  }

  function loadSession(
    date: string,
    existing: ProgramMetricSnapshot | null,
    photosOnDate: ProgressPhotoSet | null,
    announceExisting: boolean
  ) {
    const metricSource = existing ? metricsWithSnapshotCurrent(metrics, existing) : metrics;
    setSessionDate(date);
    setPrimaryDraft(toMetricDrafts(metricSource, PRIMARY_METRIC_TYPES));
    setOtherDraft(toMetricDrafts(metricSource, OTHER_METRIC_TYPES));
    setMeasurements(toMeasurementDraft(existing));
    setPhotos({
      front: emptyPhotoDraft(photosOnDate?.frontUrl ?? null),
      side: emptyPhotoDraft(photosOnDate?.sideUrl ?? null),
      back: emptyPhotoDraft(photosOnDate?.backUrl ?? null)
    });
    setPhotosExpanded(Boolean(photosOnDate?.frontUrl || photosOnDate?.sideUrl || photosOnDate?.backUrl));
    setDateNote(announceExisting && existing ? 'This date already has a check-in. Saving updates it.' : '');
    setError('');
  }

  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey) {
      const existing = snapshot?.date === openedDate ? snapshot : snapshots.find((row) => row.date === openedDate) ?? null;
      const photosOnDate =
        photoSet?.date === openedDate ? photoSet : progressPhotos.find((row) => row.date === openedDate) ?? null;
      loadSession(openedDate, existing, photosOnDate, false);
    }
  }

  function draftWithLoadedPhoto(draft: PhotoDraft, url: string | null | undefined) {
    if (draft.file || draft.existingUrl || !url) return draft;
    return emptyPhotoDraft(url);
  }

  const photosOnDate = photosForDate(sessionDate);
  const photoDrafts: Record<ProgressPhotoSlot, PhotoDraft> = {
    front: draftWithLoadedPhoto(photos.front, photosOnDate?.frontUrl),
    side: draftWithLoadedPhoto(photos.side, photosOnDate?.sideUrl),
    back: draftWithLoadedPhoto(photos.back, photosOnDate?.backUrl)
  };

  useEffect(() => {
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [objectUrls]);

  const allMetricDrafts = useMemo(() => [...primaryDraft, ...otherDraft], [primaryDraft, otherDraft]);

  function updateMetricDraft(id: string, currentValue: string) {
    setPrimaryDraft((current) => current.map((metric) => (metric.id === id ? { ...metric, currentValue } : metric)));
    setOtherDraft((current) => current.map((metric) => (metric.id === id ? { ...metric, currentValue } : metric)));
  }

  function updateMeasurement(metricType: MeasurementMetricType, value: string) {
    setMeasurements((current) => ({ ...current, [metricType]: value }));
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
      front: photoDrafts.front.existingUrl,
      side: photoDrafts.side.existingUrl,
      back: photoDrafts.back.existingUrl
    };

    for (const { slot } of PHOTO_SLOTS) {
      const photoDraft = photoDrafts[slot];
      if (photoDraft.file) {
        urls[slot] = await uploadProgressPhoto(programId, sessionDate, slot, photoDraft.file);
      }
    }

    if (!urls.front && !urls.side && !urls.back) return null;

    const photosOnDate = photosForDate(sessionDate);
    return api<ProgressPhotoSet>(`/api/programs/${programId}/progress-photos`, {
      method: 'POST',
      body: JSON.stringify({
        id: photosOnDate?.id,
        date: sessionDate,
        frontUrl: urls.front,
        sideUrl: urls.side,
        backUrl: urls.back
      })
    });
  }

  function selectSessionDate(next: string) {
    const message = checkInDateError(next, today);
    if (message) {
      setError(message);
      return;
    }
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    setObjectUrls([]);
    loadSession(next, snapshotForDate(next), photosForDate(next), true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const measurementPayload = MEASUREMENT_METRIC_TYPES.flatMap((metricType) => {
        const raw = measurements[metricType].trim();
        if (!raw) return [];
        const currentValue = Number(raw);
        if (!Number.isFinite(currentValue) || currentValue <= 0) {
          throw new Error(`Enter a valid number for ${MEASUREMENT_LABELS[metricType].toLowerCase()}.`);
        }
        return [{ metricType, currentValue, unit: 'in' }];
      });

      const snapshotMetricPayload = allMetricDrafts.map((metric) => {
        const currentValue = Number(metric.currentValue);
        if (!Number.isFinite(currentValue)) {
          throw new Error(`Enter a valid current value for ${metric.label}.`);
        }
        return {
          metricType: metric.metricType,
          currentValue,
          unit: metric.unit
        };
      });

      const dateError = checkInDateError(sessionDate, today);
      if (dateError) throw new Error(dateError);

      const activeSnapshot = snapshotForDate(sessionDate);
      if (isToday) {
        const metricPayload = allMetricDrafts.map((metric) => {
          const currentValue = Number(metric.currentValue);
          if (!Number.isFinite(currentValue)) {
            throw new Error(`Enter a valid current value for ${metric.label}.`);
          }
          return {
            id: metric.id,
            startValue: metric.startValue,
            currentValue,
            goalValue: metric.goalValue
          };
        });

        await api(`/api/programs/${programId}/metrics`, {
          method: 'PATCH',
          body: JSON.stringify(metricPayload)
        });

        const todaySnapshotPayload = [...snapshotMetricPayload, ...measurementPayload];
        if (activeSnapshot) {
          await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots/${activeSnapshot.id}`, {
            method: 'PATCH',
            body: JSON.stringify(todaySnapshotPayload)
          });
        } else {
          await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots`, {
            method: 'POST',
            body: JSON.stringify(todaySnapshotPayload)
          });
        }
      } else {
        await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots`, {
          method: 'POST',
          body: JSON.stringify({
            date: sessionDate,
            values: [...snapshotMetricPayload, ...measurementPayload]
          })
        });
      }

      await savePhotos();
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save check-in');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={clsx('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={clsx('absolute inset-0 bg-slate-950/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 top-0 flex flex-col bg-app-bg transition-transform sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(860px,92vh)] sm:w-[min(560px,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl',
          open ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(-50%+100vh)]'
        )}
      >
        <div className="shrink-0 bg-brand-navy px-5 pb-4 pt-4 text-brand-off-white">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green-light"
              onClick={onClose}
            >
              <ChevronLeft size={16} />
              Close
            </button>
          </div>
          <h2 className="mt-3 text-base font-bold uppercase tracking-wide">Check-in</h2>
          <label className="relative mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-brand-green-light">
            <CalendarDays size={14} aria-hidden />
            <span>{formatSessionDate(sessionDate)}</span>
            <input
              type="date"
              max={today}
              value={sessionDate}
              aria-label="Check-in date"
              className="absolute inset-0 cursor-pointer opacity-0"
              onClick={(event) => {
                const input = event.currentTarget;
                if (typeof input.showPicker !== 'function') return;
                try {
                  input.showPicker();
                } catch {
                  // Some browsers only open the picker from the default click.
                }
              }}
              onChange={(event) => {
                const next = event.target.value;
                if (next) selectSessionDate(next);
              }}
            />
          </label>
          <p className="mt-1 text-[11px] text-white/70">Tap the date to log a missed check-in.</p>
          {dateNote ? <p className="mt-1 text-[11px] text-white/80">{dateNote}</p> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-text-muted">Body composition</h3>
              <MetricFields draft={primaryDraft} onChange={updateMetricDraft} />
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-text-muted">Measurements</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {MEASUREMENT_METRIC_TYPES.map((metricType) => (
                  <label key={metricType} className="block rounded-2xl border border-slate-200 p-4 dark:border-app-border">
                    <span className={labelClassName()}>{MEASUREMENT_LABELS[metricType]}</span>
                    <div className="flex items-center gap-2">
                      <NumberInput
                        className={inputClassName()}
                        step="0.01"
                        value={measurements[metricType]}
                        onChange={(value) => updateMeasurement(metricType, value)}
                      />
                      <span className="text-xs text-slate-500">in</span>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-4 dark:border-app-border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={photosExpanded}
                onClick={() => setPhotosExpanded((open) => !open)}
              >
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Progress photos</h3>
                  <p className="mt-1 text-xs text-app-text-muted">Take photos approx every 8 weeks.</p>
                </div>
                <ChevronDown
                  size={18}
                  className={clsx('shrink-0 text-app-text-muted transition', photosExpanded && 'rotate-180')}
                />
              </button>
              {photosExpanded && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-app-border">
                  {PHOTO_SLOTS.map(({ slot, label }) => (
                    <ProgressPhotoUploadField
                      key={slot}
                      label={label}
                      draft={photoDrafts[slot]}
                      disabled={saving}
                      previewClassName="h-96"
                      onSelect={(file) => selectPhoto(slot, file)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-text-muted">Other metrics</h3>
              <MetricFields draft={otherDraft} onChange={updateMetricDraft} />
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>

        <div className="shrink-0 border-t border-app-border bg-app-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={saving || allMetricDrafts.length === 0}
            onClick={() => void save()}
            className="w-full rounded-xl bg-brand-green px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save check-in'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
