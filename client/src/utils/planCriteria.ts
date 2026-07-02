import type { NutritionPlanTemplateSummary } from '../types';
import { ACTIVITY_LEVEL_OPTIONS } from './activityLevel';

export function inchesToFeetInches(totalInches: number | null | undefined) {
  if (totalInches == null || totalInches <= 0) {
    return { feet: '', inches: '' };
  }
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet: String(feet), inches: String(inches) };
}

export function feetInchesToTotalInches(feet: string, inches: string) {
  if (!feet.trim() && !inches.trim()) return null;
  const parsedFeet = Number(feet || '0');
  const parsedInches = Number(inches || '0');
  if (!Number.isFinite(parsedFeet) || !Number.isFinite(parsedInches)) return null;
  if (parsedFeet < 0 || parsedFeet > 8 || parsedInches < 0 || parsedInches > 11) return null;
  return parsedFeet * 12 + parsedInches;
}

function formatHeight(totalInches: number | null | undefined) {
  if (totalInches == null) return '—';
  const { feet, inches } = inchesToFeetInches(totalInches);
  return `${feet}'${inches}"`;
}

function formatActivityLevel(level: number | null | undefined) {
  if (level == null) return '—';
  return ACTIVITY_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? String(level);
}

function formatGender(gender: string | null | undefined) {
  if (gender === 'm') return 'Male';
  if (gender === 'f') return 'Female';
  return '—';
}

function formatHeightRange(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return '—';
  if (min != null && max != null && min === max) return formatHeight(min);
  if (min != null && max != null) return `${formatHeight(min)} – ${formatHeight(max)}`;
  if (min != null) return `${formatHeight(min)}+`;
  return `Up to ${formatHeight(max)}`;
}

function formatWeightRange(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return '—';
  if (min != null && max != null && min === max) return `${Math.round(min)} lbs`;
  if (min != null && max != null) return `${Math.round(min)} – ${Math.round(max)} lbs`;
  if (min != null) return `${Math.round(min)}+ lbs`;
  return `Up to ${Math.round(max!)} lbs`;
}

export function formatPlanCriteriaDetailed(template: Pick<
  NutritionPlanTemplateSummary,
  | 'gender'
  | 'heightMinInches'
  | 'heightMaxInches'
  | 'weightMinLbs'
  | 'weightMaxLbs'
  | 'activityLevelMin'
  | 'activityLevelMax'
  | 'criteriaComplete'
>) {
  return [
    { label: 'Gender', value: formatGender(template.gender) },
    { label: 'Height', value: formatHeightRange(template.heightMinInches, template.heightMaxInches) },
    { label: 'Weight', value: formatWeightRange(template.weightMinLbs, template.weightMaxLbs) },
    {
      label: 'Activity level',
      value:
        template.activityLevelMin != null && template.activityLevelMax != null
          ? template.activityLevelMin === template.activityLevelMax
            ? formatActivityLevel(template.activityLevelMin)
            : `${formatActivityLevel(template.activityLevelMin)} – ${formatActivityLevel(template.activityLevelMax)}`
          : '—'
    },
    { label: 'Criteria status', value: template.criteriaComplete ? 'Complete' : 'Incomplete' }
  ];
}

export function formatPlanCriteriaSummary(template: Pick<
  NutritionPlanTemplateSummary,
  | 'gender'
  | 'heightMinInches'
  | 'heightMaxInches'
  | 'weightMinLbs'
  | 'weightMaxLbs'
  | 'activityLevelMin'
  | 'activityLevelMax'
  | 'criteriaComplete'
>) {
  if (!template.criteriaComplete) return 'Criteria incomplete';

  const gender = template.gender === 'm' ? 'M' : template.gender === 'f' ? 'F' : '—';
  const height =
    template.heightMinInches === template.heightMaxInches
      ? formatHeight(template.heightMinInches)
      : `${formatHeight(template.heightMinInches)}–${formatHeight(template.heightMaxInches)}`;
  const weight =
    template.weightMinLbs === template.weightMaxLbs
      ? `${Math.round(template.weightMinLbs ?? 0)} lbs`
      : `${Math.round(template.weightMinLbs ?? 0)}–${Math.round(template.weightMaxLbs ?? 0)} lbs`;
  const activity =
    template.activityLevelMin === template.activityLevelMax
      ? formatActivityLevel(template.activityLevelMin)
      : `${formatActivityLevel(template.activityLevelMin)}–${formatActivityLevel(template.activityLevelMax)}`;

  return `${gender} · ${height} · ${weight} · Activity ${activity}`;
}

export type PlanCriteriaDraft = {
  gender: '' | 'm' | 'f';
  heightMinFeet: string;
  heightMinInches: string;
  heightMaxFeet: string;
  heightMaxInches: string;
  weightMinLbs: string;
  weightMaxLbs: string;
  activityLevelMin: string;
  activityLevelMax: string;
};

export function emptyPlanCriteriaDraft(): PlanCriteriaDraft {
  return {
    gender: '',
    heightMinFeet: '',
    heightMinInches: '',
    heightMaxFeet: '',
    heightMaxInches: '',
    weightMinLbs: '',
    weightMaxLbs: '',
    activityLevelMin: '',
    activityLevelMax: ''
  };
}

export function planCriteriaDraftFromTemplate(template: NutritionPlanTemplateSummary): PlanCriteriaDraft {
  const minHeight = inchesToFeetInches(template.heightMinInches);
  const maxHeight = inchesToFeetInches(template.heightMaxInches);
  return {
    gender: template.gender === 'm' || template.gender === 'f' ? template.gender : '',
    heightMinFeet: minHeight.feet,
    heightMinInches: minHeight.inches,
    heightMaxFeet: maxHeight.feet,
    heightMaxInches: maxHeight.inches,
    weightMinLbs: template.weightMinLbs != null ? String(template.weightMinLbs) : '',
    weightMaxLbs: template.weightMaxLbs != null ? String(template.weightMaxLbs) : '',
    activityLevelMin: template.activityLevelMin != null ? String(template.activityLevelMin) : '',
    activityLevelMax: template.activityLevelMax != null ? String(template.activityLevelMax) : ''
  };
}

export function buildPlanCriteriaPayload(draft: PlanCriteriaDraft) {
  const heightMinInches = feetInchesToTotalInches(draft.heightMinFeet, draft.heightMinInches);
  const heightMaxInches = feetInchesToTotalInches(draft.heightMaxFeet, draft.heightMaxInches);
  const weightMinLbs = draft.weightMinLbs.trim() ? Number(draft.weightMinLbs) : null;
  const weightMaxLbs = draft.weightMaxLbs.trim() ? Number(draft.weightMaxLbs) : null;
  const activityLevelMin = draft.activityLevelMin.trim() ? Number(draft.activityLevelMin) : null;
  const activityLevelMax = draft.activityLevelMax.trim() ? Number(draft.activityLevelMax) : null;

  return {
    gender: draft.gender || null,
    heightMinInches,
    heightMaxInches,
    weightMinLbs,
    weightMaxLbs,
    activityLevelMin,
    activityLevelMax
  };
}

export function validatePlanCriteriaDraft(draft: PlanCriteriaDraft, visibility: 'GLOBAL' | 'USER') {
  const payload = buildPlanCriteriaPayload(draft);
  if (payload.heightMinInches != null && payload.heightMaxInches != null && payload.heightMinInches > payload.heightMaxInches) {
    return 'Minimum height must be less than or equal to maximum height';
  }
  if (payload.weightMinLbs != null && payload.weightMaxLbs != null && payload.weightMinLbs > payload.weightMaxLbs) {
    return 'Minimum weight must be less than or equal to maximum weight';
  }
  if (
    payload.activityLevelMin != null &&
    payload.activityLevelMax != null &&
    payload.activityLevelMin > payload.activityLevelMax
  ) {
    return 'Minimum activity level must be less than or equal to maximum activity level';
  }
  if (visibility === 'GLOBAL') {
    const required = [
      payload.gender,
      payload.heightMinInches,
      payload.heightMaxInches,
      payload.weightMinLbs,
      payload.weightMaxLbs,
      payload.activityLevelMin,
      payload.activityLevelMax
    ];
    if (required.some((value) => value == null)) {
      return 'GLOBAL plans require gender, height, weight, and activity criteria';
    }
  }
  return null;
}
