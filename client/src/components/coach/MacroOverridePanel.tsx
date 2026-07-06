import { useState } from 'react';
import type { NutritionMacroTargets, NutritionTargetSource } from '../../types';
import { Button } from '../ui/Button';

type MacroKey = keyof NutritionMacroTargets;

const MACROS: { key: MacroKey; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' }
];

const SOURCE_LABEL: Record<NutritionTargetSource, string> = {
  FORMULA: 'Formula (auto)',
  OVERRIDE_BAND: 'Nutritionist band',
  COACH: 'Override',
  TEMPLATE: 'Template'
};

// Typical safe daily calorie window; outside this we warn but still allow saving.
const SAFE_MIN_CALORIES = 1000;
const SAFE_MAX_CALORIES = 5000;

function toInput(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

/**
 * Macro target editor shared by the coach food tab and the self-serve nutrition page.
 * Empty fields fall back to the formula for that macro. Saving is delegated to `onSubmit`
 * (which performs the API call + any refresh); this component owns input state, validation,
 * and the extreme-value warning.
 */
export function MacroOverridePanel({
  source,
  resolvedTargets,
  overrideTargets,
  saving,
  onSavingChange,
  onError,
  onSubmit,
  title = 'Macro targets',
  description = 'These drive meal planning amounts. Leave a field blank to use the formula for that macro.',
  prefillWithResolved = false
}: {
  source: NutritionTargetSource | null;
  resolvedTargets: NutritionMacroTargets | null;
  overrideTargets: NutritionMacroTargets;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string) => void;
  onSubmit: (payload: NutritionMacroTargets) => Promise<void>;
  title?: string;
  description?: string;
  prefillWithResolved?: boolean;
}) {
  // When requested, seed each field with the real effective value (override if set,
  // otherwise the calculated target) so the user sees editable numbers, not grey hints.
  function initialValue(key: MacroKey): string {
    if (overrideTargets[key] != null) return toInput(overrideTargets[key]);
    if (prefillWithResolved) return toInput(resolvedTargets?.[key]);
    return '';
  }

  const [values, setValues] = useState<Record<MacroKey, string>>({
    calories: initialValue('calories'),
    protein: initialValue('protein'),
    carbs: initialValue('carbs'),
    fat: initialValue('fat')
  });

  const hasOverride = MACROS.some((m) => overrideTargets[m.key] != null);
  // No source + no resolved targets = the profile lacks gender/height/weight, so nothing
  // can be calculated and saving won't re-scale the plan until those are filled in.
  const profileIncomplete = source === null && resolvedTargets === null;

  const caloriesNum = Number(values.calories);
  const calorieWarning =
    values.calories.trim() !== '' &&
    Number.isFinite(caloriesNum) &&
    (caloriesNum < SAFE_MIN_CALORIES || caloriesNum > SAFE_MAX_CALORIES)
      ? `${caloriesNum.toLocaleString()} kcal is outside the typical safe range (${SAFE_MIN_CALORIES.toLocaleString()}–${SAFE_MAX_CALORIES.toLocaleString()}). Double-check before saving.`
      : null;

  function parseValues(): NutritionMacroTargets | null {
    const out: NutritionMacroTargets = { calories: null, protein: null, carbs: null, fat: null };
    for (const macro of MACROS) {
      const raw = values[macro.key].trim();
      if (raw === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) {
        onError(`${macro.label} must be a positive whole number.`);
        return null;
      }
      // Prefilled formula values are for editing convenience only — don't pin them as
      // overrides unless the user changed them or they were already overridden.
      if (
        prefillWithResolved &&
        overrideTargets[macro.key] == null &&
        resolvedTargets?.[macro.key] === num
      ) {
        continue;
      }
      out[macro.key] = num;
    }
    return out;
  }

  async function save(payload: NutritionMacroTargets) {
    onSavingChange(true);
    onError('');
    try {
      await onSubmit(payload);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save macro targets');
    } finally {
      onSavingChange(false);
    }
  }

  function handleSave() {
    const parsed = parseValues();
    if (parsed) void save(parsed);
  }

  function handleReset() {
    void save({ calories: null, protein: null, carbs: null, fat: null });
  }

  return (
    <div className="rounded-xl border border-app-border bg-app-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {source ? (
          <span className="rounded-full bg-app-surface px-3 py-1 text-xs font-medium text-app-text-muted">
            Source: {SOURCE_LABEL[source]}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-app-text-muted">{description}</p>

      {profileIncomplete ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Targets can’t be calculated until the profile has gender, height, and weight. Saving stores your numbers but
          won’t re-scale the plan until those are filled in.
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MACROS.map((macro) => (
          <label key={macro.key} className="text-sm">
            <span className="mb-1 block font-medium">
              {macro.label} <span className="text-app-text-muted">({macro.unit})</span>
            </span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 tabular-nums"
              placeholder={resolvedTargets?.[macro.key] != null ? String(resolvedTargets[macro.key]) : 'formula'}
              value={values[macro.key]}
              onChange={(event) => setValues((prev) => ({ ...prev, [macro.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      {calorieWarning ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{calorieWarning}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={saving} onClick={handleSave}>
          Save &amp; re-scale plan
        </Button>
        {hasOverride ? (
          <Button variant="secondary" disabled={saving} onClick={handleReset}>
            Reset to formula
          </Button>
        ) : null}
      </div>
    </div>
  );
}
