import { useState } from 'react';
import { Check, Copy, Link } from 'lucide-react';
import type { ExercisePlanTemplateSummary, NutritionPlanTemplateSummary } from '../../types';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

function buildInviteUrl(coachCode: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/join?coach=${encodeURIComponent(coachCode)}`;
}

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
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleCopyInviteLink() {
    if (!coachCodeDraft.trim()) return;
    const url = buildInviteUrl(coachCodeDraft.trim());
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }

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

      {coachCodeDraft.trim() ? (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-app-text-muted">Invite link</p>
          <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-muted/50 px-3 py-2">
            <Link className="h-4 w-4 flex-shrink-0 text-app-text-muted" />
            <span className="flex-1 truncate text-sm text-app-text">
              {buildInviteUrl(coachCodeDraft.trim())}
            </span>
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="flex-shrink-0 rounded-lg p-1.5 text-app-text-muted transition hover:bg-app-surface hover:text-app-text"
              aria-label="Copy invite link"
            >
              {linkCopied ? (
                <Check className="h-4 w-4 text-brand-green" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-app-text-muted">
            Share this link with new clients. They'll see your name and confirm before joining.
          </p>
        </div>
      ) : null}

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
