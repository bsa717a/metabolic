import { useState } from 'react';
import { api } from '../../services/api';
import { useAiConsent } from '../../context/AiConsentContext';
import { AI_CONSENT_REQUIRED_MESSAGE } from '../../content/aiConsentCopy';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';
import { AiDisabledNotice } from '../privacy/AiDisabledNotice';

type LookupItem = {
  source: 'existing' | 'ai';
  line: string;
  food?: { name: string };
  lookup?: { id: string };
  estimate?: {
    normalizedFoodName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

type LookupResult = {
  source: 'existing' | 'ai' | 'mixed';
  items: LookupItem[];
};

function formatMacros(estimate: NonNullable<LookupItem['estimate']>) {
  return `${estimate.calories} kcal, ${estimate.protein}g protein, ${estimate.carbs}g carbs, ${estimate.fat}g fat`;
}

export function AiFoodLookupDrawer({
  open,
  mealId,
  itemType = 'ACTUAL',
  onClose,
  onSaved
}: {
  open: boolean;
  mealId?: string;
  itemType?: 'PLANNED' | 'ACTUAL';
  onClose: () => void;
  onSaved: () => void;
}) {
  const title = itemType === 'PLANNED' ? 'AI Food Lookup — Plan' : 'AI Food Lookup — Log';

  return (
    <Drawer open={open} title={title} onClose={onClose}>
      {open && <AiFoodLookupContent mealId={mealId} itemType={itemType} onClose={onClose} onSaved={onSaved} />}
    </Drawer>
  );
}

function AiFoodLookupContent({
  mealId,
  itemType,
  onClose,
  onSaved
}: {
  mealId?: string;
  itemType: 'PLANNED' | 'ACTUAL';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState('6 oz grilled chicken breast');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string>();
  const { accepted, openReview } = useAiConsent();

  const aiItems = result?.items.filter((item) => item.source === 'ai' && item.lookup?.id && item.estimate) ?? [];
  const existingItems = result?.items.filter((item) => item.source === 'existing' && item.food) ?? [];

  async function lookup() {
    if (!accepted) {
      openReview();
      setError(AI_CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setResult(await api<LookupResult>('/api/ai/food-lookup', { method: 'POST', body: JSON.stringify({ inputText: input }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function acceptAll() {
    const lookupIds = aiItems.map((item) => item.lookup!.id);
    if (!lookupIds.length) {
      setError('Estimate again before accepting.');
      return;
    }
    if (!mealId) {
      setError('No meal selected. Close and open AI lookup from a meal.');
      return;
    }

    setAccepting(true);
    setError(undefined);
    try {
      await api('/api/ai/food-lookup/accept-batch', {
        method: 'POST',
        body: JSON.stringify({ lookupIds, mealId, type: itemType })
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add food to meal');
    } finally {
      setAccepting(false);
    }
  }

  const acceptLabel = itemType === 'PLANNED' ? 'Accept and add to plan' : 'Accept and save';
  const acceptAllLabel = aiItems.length > 1 ? `${acceptLabel} (${aiItems.length} items)` : acceptLabel;

  return (
    <div className="space-y-4">
      {!accepted ? <AiDisabledNotice onReview={openReview} /> : null}
      <textarea
        className="h-36 w-full rounded-2xl border border-slate-200 p-3"
        placeholder={'One food per line, e.g.\n6 oz grilled chicken\n1/2 cup whole corn\n1 cup almonds'}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      <Button onClick={lookup} disabled={loading}>{loading ? 'Estimating…' : 'Estimate nutrition'}</Button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {aiItems.length > 0 && (
        <div className="space-y-3">
          {aiItems.map((item) => (
            <div key={item.lookup!.id} className="rounded-2xl bg-slate-50 p-4">
              <p className="font-bold">{item.estimate!.normalizedFoodName}</p>
              <p className="text-sm text-slate-600">{formatMacros(item.estimate!)}</p>
            </div>
          ))}
          <Button onClick={acceptAll} disabled={accepting || loading}>
            {accepting ? 'Adding…' : acceptAllLabel}
          </Button>
        </div>
      )}

      {existingItems.length > 0 && (
        <div className="space-y-2">
          {existingItems.map((item) => (
            <p key={item.line} className="rounded-2xl bg-emerald-50 p-4 text-sm">
              Found in database: <span className="font-semibold">{item.food!.name}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
