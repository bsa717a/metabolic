import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { NutritionMacroTargets, UserNutritionTargets } from '../../types';
import { Drawer } from '../ui/Drawer';
import { MacroOverridePanel } from '../coach/MacroOverridePanel';

/**
 * Self-serve macro override. Lets a user set their own calorie/macro goals — the same
 * mechanism coaches use — with the plan re-scaling immediately on save. Useful especially
 * for self-directed users who have no coach managing their targets.
 */
export function NutritionTargetsDrawer({
  open,
  planDate,
  onClose,
  onSaved
}: {
  open: boolean;
  planDate: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [targets, setTargets] = useState<UserNutritionTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      setTargets(null);
      try {
        const data = await api<UserNutritionTargets>('/api/nutrition-targets');
        if (!cancelled) setTargets(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load your targets');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function submit(payload: NutritionMacroTargets) {
    const saved = await api<UserNutritionTargets>('/api/nutrition-targets', {
      method: 'PUT',
      body: JSON.stringify({ ...payload, date: planDate })
    });
    await onSaved();
    // Incomplete profile → nothing could be calculated or re-scaled. Tell the user rather
    // than closing on a silent no-op.
    if (!saved.resolvedTargets) {
      setError('Saved, but we couldn’t calculate targets yet — add your gender, height, and weight in your profile.');
      return;
    }
    onClose();
  }

  return (
    <Drawer open={open} title="Adjust my targets" onClose={onClose} panelClassName="max-w-lg">
      {loading ? (
        <p className="text-sm text-app-text-muted">Loading your targets…</p>
      ) : !targets ? (
        <p className="text-sm text-red-600">{error || 'Unable to load your targets.'}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-app-text-muted">
            Set your own calorie and macro goals. Leave a field blank to let the app calculate it for you. Your meal
            plan re-scales to match.
          </p>
          <MacroOverridePanel
            key={`${targets.overrideTargets.calories}|${targets.overrideTargets.protein}|${targets.overrideTargets.carbs}|${targets.overrideTargets.fat}`}
            source={targets.source}
            resolvedTargets={targets.resolvedTargets}
            overrideTargets={targets.overrideTargets}
            saving={saving}
            onSavingChange={setSaving}
            onError={setError}
            onSubmit={submit}
            title="My macro goals"
            description="These drive your meal plan amounts. Leave a field blank to use the automatic calculation."
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      )}
    </Drawer>
  );
}
