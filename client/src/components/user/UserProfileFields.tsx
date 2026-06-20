import type { ProfileDraft } from './userProfileForm';
import { BirthDateInput } from '../ui/BirthDateInput';

function labelClassName() {
  return 'mb-1 block text-sm font-medium text-slate-600 dark:text-app-text-muted';
}

function inputClassName() {
  return 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-app-border dark:bg-app-surface dark:text-app-text';
}

export function UserProfileFields({
  draft,
  canEditClientNotes,
  onChange
}: {
  draft: ProfileDraft;
  canEditClientNotes: boolean;
  onChange: <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-app-text">Health profile</p>
        <p className="mt-1 text-sm text-app-text-muted">
          Stable details used for coaching, nutrition planning, and lab reference ranges.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClassName()}>Gender</span>
          <select
            className={inputClassName()}
            value={draft.gender}
            onChange={(event) => onChange('gender', event.target.value as 'm' | 'f' | '')}
          >
            <option value="">Not set</option>
            <option value="f">Female</option>
            <option value="m">Male</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClassName()}>Birth date</span>
          <BirthDateInput
            value={draft.birthDate}
            onChange={(value) => onChange('birthDate', value)}
            fieldClass={inputClassName()}
          />
        </label>
      </div>

      <div>
        <p className={labelClassName()}>Height</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-app-text-muted">Feet</span>
            <input
              className={inputClassName()}
              type="number"
              min={0}
              max={8}
              step={1}
              placeholder="5"
              value={draft.heightFeet}
              onChange={(event) => onChange('heightFeet', event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-app-text-muted">Inches</span>
            <input
              className={inputClassName()}
              type="number"
              min={0}
              max={11}
              step={1}
              placeholder="10"
              value={draft.heightInches}
              onChange={(event) => onChange('heightInches', event.target.value)}
            />
          </label>
        </div>
      </div>

      <label className="block">
        <span className={labelClassName()}>Medical conditions</span>
        <textarea
          className={`${inputClassName()} min-h-[5rem] resize-y`}
          placeholder="Diabetes, hypertension, etc."
          value={draft.medicalConditions}
          onChange={(event) => onChange('medicalConditions', event.target.value)}
        />
      </label>

      <label className="block">
        <span className={labelClassName()}>Exercise restrictions</span>
        <textarea
          className={`${inputClassName()} min-h-[5rem] resize-y`}
          placeholder="Avoid high-impact activity, etc."
          value={draft.exerciseRestrictions}
          onChange={(event) => onChange('exerciseRestrictions', event.target.value)}
        />
      </label>

      <label className="block">
        <span className={labelClassName()}>Food allergies</span>
        <textarea
          className={`${inputClassName()} min-h-[5rem] resize-y`}
          placeholder="Peanuts, shellfish, etc."
          value={draft.foodAllergies}
          onChange={(event) => onChange('foodAllergies', event.target.value)}
        />
      </label>

      <label className="block">
        <span className={labelClassName()}>Dietary preferences</span>
        <textarea
          className={`${inputClassName()} min-h-[5rem] resize-y`}
          placeholder="Vegetarian, low sodium, etc."
          value={draft.dietaryPreferences}
          onChange={(event) => onChange('dietaryPreferences', event.target.value)}
        />
      </label>

      {canEditClientNotes ? (
        <label className="block">
          <span className={labelClassName()}>Client notes</span>
          <textarea
            className={`${inputClassName()} min-h-[5rem] resize-y`}
            placeholder="Internal coach notes about this client."
            value={draft.clientNotes}
            onChange={(event) => onChange('clientNotes', event.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}
