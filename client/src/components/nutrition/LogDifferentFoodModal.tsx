import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { Food } from '../../types';
import type { GamificationCelebration } from '../../types/gamification';

type LookupResult = {
  items: Array<{
    source: 'existing' | 'ai';
    food?: {
      id: string;
      name: string;
      servingUnit: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
    lookup?: { id: string };
    estimate?: {
      normalizedFoodName: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  }>;
};

/**
 * The "Ate something different" box: describe a meal in text or a photo, let AI estimate the
 * nutrition, and add it to a meal as ACTUAL (off-plan) food. Shared by the per-meal log actions
 * and the Add foods panel so both surfaces use exactly the same flow.
 */
export function LogDifferentFoodModal({
  open,
  mealId,
  title = 'What did you have instead?',
  itemType = 'ACTUAL',
  onClose,
  onSaved,
  onFoodAccepted
}: {
  open: boolean;
  mealId?: string;
  title?: string;
  itemType?: 'PLANNED' | 'ACTUAL';
  onClose: () => void;
  onSaved?: (celebrations: GamificationCelebration[]) => void;
  /** When set, accepts lookups as foods without attaching to a meal (e.g. admin meal builder). */
  onFoodAccepted?: (foods: Food[]) => void | Promise<void>;
}) {
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  function close() {
    setError(null);
    clearPhoto();
    setDescription('');
    onClose();
  }

  function selectPhoto(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be 10 MB or smaller.');
      return;
    }
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? '');
        resolve(result.includes(',') ? result.split(',')[1] ?? '' : result);
      };
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });
  }

  async function logDifferentFood() {
    const input = description.trim();
    if (!input && !photo) return;
    if (!mealId && !onFoodAccepted) {
      setError('Select a meal first.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const lookup = photo
        ? await api<LookupResult>('/api/ai/food-lookup/photo', {
            method: 'POST',
            body: JSON.stringify({
              imageBase64: await fileToBase64(photo.file),
              mimeType: photo.file.type,
              inputText: input
            })
          })
        : await api<LookupResult>('/api/ai/food-lookup', {
            method: 'POST',
            body: JSON.stringify({ inputText: input })
          });
      const lookupIds = lookup.items
        .filter((item) => item.source === 'ai' && item.lookup?.id && item.estimate)
        .map((item) => item.lookup!.id);

      if (!lookupIds.length) {
        const existingFoods = lookup.items.filter((item) => item.source === 'existing' && item.food);
        if (!existingFoods.length) {
          throw new Error('Could not estimate nutrition for that food. Try adding a portion, like "1 cup" or "6 oz".');
        }
      }

      if (onFoodAccepted) {
        const acceptedFoods: Food[] = [];

        for (const lookupId of lookupIds) {
          acceptedFoods.push(
            await api<Food>(`/api/ai/food-lookup/${lookupId}/accept`, {
              method: 'POST',
              body: JSON.stringify({})
            })
          );
        }

        for (const item of lookup.items.filter((entry) => entry.source === 'existing' && entry.food)) {
          const existing = item.food!;
          acceptedFoods.push({
            id: existing.id,
            name: existing.name,
            servingSize: 1,
            servingUnit: existing.servingUnit,
            calories: Number(existing.calories),
            protein: Number(existing.protein),
            carbs: Number(existing.carbs),
            fat: Number(existing.fat)
          });
        }

        await onFoodAccepted(acceptedFoods);
        close();
        return;
      }

      if (lookupIds.length) {
        await api('/api/ai/food-lookup/accept-batch', {
          method: 'POST',
          body: JSON.stringify({ lookupIds, mealId, type: itemType })
        });
      }

      await Promise.all(
        lookup.items
          .filter((item) => item.source === 'existing' && item.food)
          .map((item) =>
            api(`/api/meals/${mealId}/items`, {
              method: 'POST',
              body: JSON.stringify({
                foodId: item.food!.id,
                type: itemType,
                nameSnapshot: item.food!.name,
                quantity: 1,
                unit: item.food!.servingUnit,
                calories: Number(item.food!.calories),
                protein: Number(item.food!.protein),
                carbs: Number(item.food!.carbs),
                fat: Number(item.food!.fat)
              })
            })
          )
      );

      if (itemType === 'ACTUAL') {
        const res = await api<{ celebrations: GamificationCelebration[] }>(
          `/api/gamification/meals/${mealId}/log`,
          {
            method: 'POST',
            body: JSON.stringify({
              status: 'ATE_SOMETHING_DIFFERENT',
              actualFoodDescription: input || 'Uploaded meal photo'
            })
          }
        );
        onSaved?.(res.celebrations ?? []);
      } else {
        onSaved?.([]);
      }

      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save what you ate.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={close}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <textarea
            className="min-h-28 flex-1 rounded-xl border border-app-border bg-app-bg p-3 text-sm"
            rows={3}
            placeholder="Describe what you ate, e.g. 6 oz grilled chicken and 1 cup rice"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-app-border bg-app-muted text-app-text-muted transition hover:border-brand-green/40 hover:text-app-text"
            title="Upload meal photo"
            aria-label="Upload meal photo"
            disabled={loading}
            onClick={() => photoInputRef.current?.click()}
          >
            <Camera size={20} />
          </button>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) selectPhoto(file);
            event.target.value = '';
          }}
        />
        {photo && (
          <div className="relative overflow-hidden rounded-xl border border-app-border">
            <img src={photo.previewUrl} alt="Meal preview" className="h-40 w-full object-cover" />
            <button
              type="button"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
              aria-label="Remove meal photo"
              disabled={loading}
              onClick={clearPhoto}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <p className="text-xs text-app-text-muted">
          {onFoodAccepted
            ? 'AI will estimate the nutrition from your text or photo so you can add it to this meal step.'
            : itemType === 'ACTUAL'
              ? 'AI will estimate the nutrition from your text or photo and add it as actual food for this meal.'
              : 'AI will estimate the nutrition from your text or photo and add it to the plan for this meal.'}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          disabled={(!description.trim() && !photo) || loading}
          onClick={() => void logDifferentFood()}
          className="w-full"
        >
          {loading ? 'Estimating…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}
