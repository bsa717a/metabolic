import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Program, ProgressPhotoSet } from '../../types';
import { api, todayKey } from '../../services/api';
import { isFirebaseStorageConfigured } from '../../services/firebase';
import {
  uploadProgressPhoto,
  validateProgressPhotoFile,
  type ProgressPhotoSlot
} from '../../services/progressPhotoStorage';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { NumberInput } from '../ui/NumberInput';
import {
  emptyPhotoDraft,
  ProgressPhotoUploadField,
  type PhotoDraft
} from '../program/ProgressPhotoUploadField';
import type { GamificationCelebration } from '../../types/gamification';

const PHOTO_SLOTS: Array<{ slot: ProgressPhotoSlot; label: string }> = [
  { slot: 'front', label: 'Front' },
  { slot: 'side', label: 'Side' },
  { slot: 'back', label: 'Back' }
];

const MEASUREMENT_FIELDS = [
  { metricType: 'WAIST', key: 'waist', label: 'Waist', unit: 'in' },
  { metricType: 'HIPS', key: 'hips', label: 'Hips', unit: 'in' },
  { metricType: 'CHEST', key: 'chest', label: 'Chest', unit: 'in' }
] as const;

export function BaselineSnapshotForm({
  onSaved
}: {
  onSaved?: (celebrations: GamificationCelebration[]) => void;
}) {
  const [program, setProgram] = useState<Program | null>(null);
  const [existingPhotos, setExistingPhotos] = useState<ProgressPhotoSet | null>(null);
  const [weight, setWeight] = useState('');
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<ProgressPhotoSlot, PhotoDraft>>({
    front: emptyPhotoDraft(),
    side: emptyPhotoDraft(),
    back: emptyPhotoDraft()
  });
  const [objectUrls, setObjectUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const date = todayKey();

  useEffect(() => {
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [objectUrls]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const programs = await api<Program[]>('/api/programs');
        const active = programs[0] ?? null;
        setProgram(active);
        if (active) {
          const photoSets = await api<ProgressPhotoSet[]>(`/api/programs/${active.id}/progress-photos`);
          const baseline = photoSets.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
          setExistingPhotos(baseline);
          if (baseline) {
            setPhotos({
              front: emptyPhotoDraft(baseline.frontUrl),
              side: emptyPhotoDraft(baseline.sideUrl),
              back: emptyPhotoDraft(baseline.backUrl)
            });
          }
          const snapshots = await api<Array<{ date: string; values: Array<{ metricType: string; currentValue: number }> }>>(
            `/api/programs/${active.id}/metric-snapshots`
          );
          const earliest = snapshots.sort((a, b) => a.date.localeCompare(b.date))[0];
          if (earliest) {
            const weightVal = earliest.values.find((v) => v.metricType === 'WEIGHT');
            if (weightVal) setWeight(String(weightVal.currentValue));
            for (const field of MEASUREMENT_FIELDS) {
              const val = earliest.values.find((v) => v.metricType === field.metricType);
              if (val) setMeasurements((m) => ({ ...m, [field.key]: String(val.currentValue) }));
            }
          }
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

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
          [slot]: { existingUrl: current[slot].existingUrl, file, previewUrl }
        };
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to use that photo');
    }
  }

  async function saveMeasurements(programId: string) {
    if (weight.trim()) {
      const parsed = Number(weight);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Enter a valid starting weight.');
      await api(`/api/programs/${programId}/metric-snapshots/measurements`, {
        method: 'POST',
        body: JSON.stringify({ date, metricType: 'WEIGHT', currentValue: parsed, unit: 'lbs' })
      });
    }
    for (const field of MEASUREMENT_FIELDS) {
      const raw = measurements[field.key]?.trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Enter a valid ${field.label.toLowerCase()} measurement.`);
      }
      await api(`/api/programs/${programId}/metric-snapshots/measurements`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          metricType: field.metricType,
          currentValue: parsed,
          unit: field.unit
        })
      });
    }
  }

  async function savePhotos(programId: string): Promise<Record<ProgressPhotoSlot, string | null>> {
    if (!isFirebaseStorageConfigured) {
      throw new Error('Photo uploads are not configured. Add VITE_FIREBASE_STORAGE_BUCKET to client/.env.');
    }

    const urls: Record<ProgressPhotoSlot, string | null> = {
      front: photos.front.existingUrl,
      side: photos.side.existingUrl,
      back: photos.back.existingUrl
    };

    for (const { slot } of PHOTO_SLOTS) {
      const draft = photos[slot];
      if (draft.file) {
        urls[slot] = await uploadProgressPhoto(programId, date, slot, draft.file);
      }
    }

    if (!urls.front && !urls.side && !urls.back) {
      throw new Error('Upload at least one progress photo.');
    }

    await api<ProgressPhotoSet>(`/api/programs/${programId}/progress-photos`, {
      method: 'POST',
      body: JSON.stringify({
        id: existingPhotos?.id,
        date,
        frontUrl: urls.front,
        sideUrl: urls.side,
        backUrl: urls.back
      })
    });

    return urls;
  }

  async function save(complete: boolean) {
    if (!program) {
      setError('No active program found.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveMeasurements(program.id);
      const photoUrls = await savePhotos(program.id);

      if (complete) {
        const res = await api<{ celebrations: GamificationCelebration[] }>('/api/gamification/snapshots', {
          method: 'POST',
          body: JSON.stringify({
            snapshotDate: date,
            weight: weight ? Number(weight) : undefined,
            measurements: Object.fromEntries(
              MEASUREMENT_FIELDS.map((f) => [f.key, measurements[f.key] ? Number(measurements[f.key]) : undefined]).filter(
                ([, v]) => v != null
              )
            ),
            frontPhotoUrl: photoUrls.front,
            sidePhotoUrl: photoUrls.side,
            backPhotoUrl: photoUrls.back,
            complete: true
          })
        });
        onSaved?.(res.celebrations ?? []);
      } else {
        onSaved?.([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save baseline');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-app-text-muted text-sm">Loading…</p>;

  if (!program) {
    return (
      <Card>
        <p className="text-app-text-muted">Set up your program before capturing a baseline snapshot.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">Baseline snapshot</h2>
      <p className="mt-1 text-sm text-app-text-muted">
        Create your starting point so you can see how your body changes over time. Photos use the same upload flow as
        the{' '}
        <Link to="/program" className="font-medium text-brand-green hover:underline">
          Metabolic Blueprint
        </Link>{' '}
        page.
      </p>

      <label className="mt-4 block text-sm font-medium">
        Starting weight (lbs)
        <NumberInput
          className="mt-1 w-full rounded-xl border border-app-border bg-app-bg px-3 py-2"
          value={weight}
          onChange={setWeight}
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {MEASUREMENT_FIELDS.map((f) => (
          <label key={f.key} className="text-sm font-medium">
            {f.label} ({f.unit})
            <NumberInput
              className="mt-1 w-full rounded-xl border border-app-border bg-app-bg px-3 py-2"
              value={measurements[f.key] ?? ''}
              onChange={(value) => setMeasurements((m) => ({ ...m, [f.key]: value }))}
            />
          </label>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium">Progress photos</p>
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

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" disabled={saving} onClick={() => void save(false)}>
          Save progress
        </Button>
        <Button disabled={saving} onClick={() => void save(true)}>
          {saving ? 'Saving…' : 'Save baseline & continue'}
        </Button>
      </div>
    </Card>
  );
}
