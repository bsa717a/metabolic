import { nutritionPlanPickerOptions } from './nutritionPlanPicker';

/** Fields the food-plan dropdown can use without changing which plans are listed. */
export type NutritionPlanGroupSource = {
  id: string;
  name: string;
  description?: string | null;
  visibility?: string | null;
  gender?: string | null;
  heightMinInches?: number | null;
  heightMaxInches?: number | null;
  weightMinLbs?: number | null;
  weightMaxLbs?: number | null;
  activityLevelMin?: number | null;
  activityLevelMax?: number | null;
  calorieTarget?: number | null;
  proteinTarget?: number | null;
  mealCount?: number | null;
  updatedAt?: string | null;
};

export type NutritionPlanGroupOption = {
  id: string;
  /** Stored plan name. The closed control and the open list show `label`. */
  name: string;
  label: string;
  calories: number | null;
};

export type NutritionPlanOptionGroup = {
  label: string;
  options: NutritionPlanGroupOption[];
};

const ASSIGNED_GROUP = 'Assigned to this client';
const YOURS_GROUP = 'Your templates';
const OTHER_GROUP = 'Other plans';

const BODY_NAME = /^(\d+)'(\d+)"\s+(male|female)\b/i;
const WEEK_IN_NAME = /\bweek\s+(\d+)\b/i;
const KCAL_IN_NAME = /(\d+)\s*kcal\b/i;

type BodyType = {
  label: string;
  heightInches: number;
  genderRank: number;
};

type Classified = {
  plan: NutritionPlanGroupSource;
  name: string;
  body: BodyType | null;
  calories: number | null;
  bucket: 'assigned' | 'yours' | 'other' | 'body';
  baseLabel: string;
  label: string;
};

function roundNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value));
}

function formatHeightInches(total: number) {
  const feet = Math.floor(total / 12);
  const inches = total % 12;
  return `${feet}'${inches}"`;
}

function genderWord(gender: string | null | undefined): 'Male' | 'Female' | null {
  if (!gender) return null;
  const value = gender.trim().toLowerCase();
  if (value === 'm' || value === 'male') return 'Male';
  if (value === 'f' || value === 'female') return 'Female';
  return null;
}

function bodyTypeOf(plan: NutritionPlanGroupSource): BodyType | null {
  const sex = genderWord(plan.gender);
  const min = plan.heightMinInches;
  const max = plan.heightMaxInches;
  if (sex && min != null && max != null && min > 0 && max > 0) {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const mid = Math.round((low + high) / 2);
    const heightLabel =
      high - low <= 2 ? formatHeightInches(mid) : `${formatHeightInches(low)}–${formatHeightInches(high)}`;
    return {
      label: `${heightLabel} ${sex}`,
      heightInches: mid,
      genderRank: sex === 'Male' ? 0 : 1
    };
  }

  const match = plan.name.trim().match(BODY_NAME);
  if (!match) return null;
  const feet = Number(match[1]);
  const inches = Number(match[2]);
  const parsedSex = match[3].toLowerCase() === 'male' ? 'Male' : 'Female';
  return {
    label: `${feet}'${inches}" ${parsedSex}`,
    heightInches: feet * 12 + inches,
    genderRank: parsedSex === 'Male' ? 0 : 1
  };
}

function caloriesOf(plan: NutritionPlanGroupSource) {
  const fromTarget = roundNumber(plan.calorieTarget);
  if (fromTarget != null) return fromTarget;
  const match = plan.name.match(KCAL_IN_NAME);
  return match ? Number(match[1]) : null;
}

function weekDetail(name: string) {
  const match = name.match(WEEK_IN_NAME);
  return match ? `Week ${match[1]}` : null;
}

/** Extra words in the stored name, such as a version, that are not the body type or calorie count. */
function shortNameDetail(name: string, bodyLabel: string | null) {
  let rest = name.trim().replace(BODY_NAME, '');
  if (bodyLabel) {
    const escaped = bodyLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rest = rest.replace(new RegExp(`^${escaped}\\s*`, 'i'), '');
  }
  rest = rest
    .replace(WEEK_IN_NAME, ' ')
    .replace(KCAL_IN_NAME, ' ')
    .replace(/[·•|,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rest || rest.length > 32) return null;
  // A personal name is not a plan version. Leave those plans to structured details.
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(rest)) return null;
  return rest;
}

function activityDetail(plan: NutritionPlanGroupSource) {
  const min = plan.activityLevelMin;
  const max = plan.activityLevelMax;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `Activity ${Math.min(min, max)}–${Math.max(min, max)}`;
  const level = min ?? max;
  return level == null ? null : `Activity ${level}`;
}

function weightDetail(plan: NutritionPlanGroupSource) {
  const min = roundNumber(plan.weightMinLbs);
  const max = roundNumber(plan.weightMaxLbs);
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${Math.min(min, max)}–${Math.max(min, max)} lb`;
  const one = min ?? max;
  return one == null ? null : `${one} lb`;
}

function proteinDetail(plan: NutritionPlanGroupSource) {
  const protein = roundNumber(plan.proteinTarget);
  return protein == null ? null : `${protein}g protein`;
}

function mealDetail(plan: NutritionPlanGroupSource) {
  if (plan.mealCount == null || plan.mealCount <= 0) return null;
  return plan.mealCount === 1 ? '1 meal' : `${plan.mealCount} meals`;
}

function calorieDetail(plan: NutritionPlanGroupSource) {
  const calories = caloriesOf(plan);
  return calories == null ? null : `${calories} kcal`;
}

function bucketFor(plan: NutritionPlanGroupSource, assignedId: string | null, body: BodyType | null): Classified['bucket'] {
  const assigned = Boolean(assignedId && plan.id === assignedId);
  if (plan.visibility === 'USER') return assigned ? 'assigned' : 'yours';
  if (!body) return assigned ? 'assigned' : 'other';
  return 'body';
}

function baseLabelFor(plan: NutritionPlanGroupSource, body: BodyType | null, calories: number | null) {
  if (!body) return plan.name.trim();
  const kcal = calories == null ? plan.name.trim() : `${calories} kcal`;
  const extras = [weekDetail(plan.name), shortNameDetail(plan.name, body.label)].filter(Boolean);
  return extras.length ? `${kcal} · ${extras.join(' · ')}` : kcal;
}

const DETAIL_FIELDS = [calorieDetail, activityDetail, weightDetail, proteinDetail, mealDetail];

function duplicateSuffixes(plans: NutritionPlanGroupSource[]) {
  const suffixes = plans.map(() => '');
  for (const field of DETAIL_FIELDS) {
    const values = plans.map(field);
    const present = values.filter((value): value is string => Boolean(value));
    if (new Set(present).size < 2) continue;
    values.forEach((value, index) => {
      if (value && !suffixes[index]) suffixes[index] = value;
    });
    if (suffixes.every(Boolean) && new Set(suffixes).size === plans.length) return suffixes;
  }

  const groups = new Map<string, number[]>();
  suffixes.forEach((suffix, index) => {
    const key = suffix;
    const indexes = groups.get(key) ?? [];
    indexes.push(index);
    groups.set(key, indexes);
  });

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    const ordered = [...indexes].sort((a, b) => {
      const updated = (plans[a]?.updatedAt ?? '').localeCompare(plans[b]?.updatedAt ?? '');
      if (updated) return updated;
      return (plans[a]?.id ?? '').localeCompare(plans[b]?.id ?? '');
    });
    ordered.forEach((planIndex, versionIndex) => {
      const version = `v${versionIndex + 1}`;
      suffixes[planIndex] = suffixes[planIndex] ? `${suffixes[planIndex]} · ${version}` : version;
    });
  }

  return suffixes;
}

function applyLabels(plans: Classified[]) {
  const clusters = new Map<string, Classified[]>();
  for (const plan of plans) {
    const key = `${plan.bucket}:${plan.body?.label ?? ''}:${plan.baseLabel}`;
    const cluster = clusters.get(key) ?? [];
    cluster.push(plan);
    clusters.set(key, cluster);
  }

  for (const cluster of clusters.values()) {
    if (cluster.length === 1) {
      cluster[0]!.label = cluster[0]!.baseLabel;
      continue;
    }
    const suffixes = duplicateSuffixes(cluster.map((entry) => entry.plan));
    cluster.forEach((entry, index) => {
      const suffix = suffixes[index];
      entry.label = suffix ? `${entry.baseLabel} · ${suffix}` : entry.baseLabel;
    });
  }
}

function compareOptions(a: NutritionPlanGroupOption, b: NutritionPlanGroupOption) {
  const caloriesA = a.calories ?? Number.POSITIVE_INFINITY;
  const caloriesB = b.calories ?? Number.POSITIVE_INFINITY;
  if (caloriesA !== caloriesB) return caloriesA - caloriesB;
  const byLabel = a.label.localeCompare(b.label, undefined, { numeric: true });
  if (byLabel) return byLabel;
  return a.id.localeCompare(b.id);
}

/**
 * Group the plans the picker already decided to show.
 * Body-type library plans share a group. Coach templates, other named plans,
 * and a non-body plan already assigned to the client each get their own group.
 */
export function groupNutritionPlanOptions(
  plans: NutritionPlanGroupSource[],
  assigned: { id: string; name: string } | null
): NutritionPlanOptionGroup[] {
  const options = nutritionPlanPickerOptions(plans, assigned);
  const classified: Classified[] = options.map((plan) => {
    const body = bodyTypeOf(plan);
    const calories = caloriesOf(plan);
    return {
      plan,
      name: plan.name,
      body,
      calories,
      bucket: bucketFor(plan, assigned?.id ?? null, body),
      baseLabel: baseLabelFor(plan, body, calories),
      label: ''
    };
  });
  applyLabels(classified);

  const groups = new Map<
    string,
    { label: string; bucket: Classified['bucket']; heightInches: number; genderRank: number; options: NutritionPlanGroupOption[] }
  >();

  for (const entry of classified) {
    const label =
      entry.bucket === 'assigned'
        ? ASSIGNED_GROUP
        : entry.bucket === 'yours'
          ? YOURS_GROUP
          : entry.bucket === 'other'
            ? OTHER_GROUP
            : (entry.body?.label ?? OTHER_GROUP);
    const existing = groups.get(label);
    const option: NutritionPlanGroupOption = {
      id: entry.plan.id,
      name: entry.name,
      label: entry.label,
      calories: entry.calories
    };
    if (existing) {
      existing.options.push(option);
      continue;
    }
    groups.set(label, {
      label,
      bucket: entry.bucket,
      heightInches: entry.body?.heightInches ?? 0,
      genderRank: entry.body?.genderRank ?? 0,
      options: [option]
    });
  }

  const bucketRank = { assigned: 0, yours: 1, other: 2, body: 3 };
  return [...groups.values()]
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return bucketRank[a.bucket] - bucketRank[b.bucket];
      if (a.bucket === 'body' && b.bucket === 'body') {
        if (a.heightInches !== b.heightInches) return b.heightInches - a.heightInches;
        if (a.genderRank !== b.genderRank) return a.genderRank - b.genderRank;
      }
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    })
    .map((group) => ({
      label: group.label,
      options: [...group.options].sort(compareOptions)
    }));
}
