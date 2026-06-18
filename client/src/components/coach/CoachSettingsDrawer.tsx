import type { ExercisePlanTemplateSummary, NutritionPlanTemplateSummary } from '../../types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

export function CoachSettingsDrawer({
  open,
  coachCodeDraft,
  defaultNutritionTemplateId,
  defaultExerciseTemplateId,
  nutritionTemplates,
  exerciseTemplates,
  saving,
  onCoachCodeChange,
  onDefaultNutritionTemplateChange,
  onDefaultExerciseTemplateChange,
  onSave,
  onClose
}: {
  open: boolean;
  coachCodeDraft: string;
  defaultNutritionTemplateId: string;
  defaultExerciseTemplateId: string;
  nutritionTemplates: NutritionPlanTemplateSummary[];
  exerciseTemplates: ExercisePlanTemplateSummary[];
  saving: boolean;
  onCoachCodeChange: (value: string) => void;
  onDefaultNutritionTemplateChange: (value: string) => void;
  onDefaultExerciseTemplateChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} title="Coach settings" onClose={onClose}>
      <p className="text-sm text-app-text-muted">
        Users can enter your code during setup to get assigned and start on these plans.
      </p>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Coach code</span>
        <input
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 uppercase"
          value={coachCodeDraft}
          onChange={(event) => onCoachCodeChange(event.target.value.toUpperCase())}
          placeholder="DF"
          maxLength={20}
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Default nutrition plan</span>
        <select
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
          value={defaultNutritionTemplateId}
          onChange={(event) => onDefaultNutritionTemplateChange(event.target.value)}
        >
          <option value="">Use global starter plan</option>
          {nutritionTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Default exercise plan</span>
        <select
          className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2"
          value={defaultExerciseTemplateId}
          onChange={(event) => onDefaultExerciseTemplateChange(event.target.value)}
        >
          <option value="">Use global starter plan</option>
          {exerciseTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <Button type="button" className="mt-6 w-full" disabled={saving} onClick={onSave}>
        {saving ? 'Saving...' : 'Save defaults'}
      </Button>
    </Drawer>
  );
}
