import { defaultRepsToScheme } from '../utils/repSchemes.js';
import type { TemplateItemPrescriptionOverride } from './exerciseTemplateApply.js';

export type RoutineTemplateItemSnapshot = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
};

export type RoutineExtraSnapshot = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
};

export type ComposedRoutineExercise = {
  exerciseId: string;
  sortOrder: number;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
  templateItemId: string | null;
  extraId: string | null;
};

function applyOverride(
  item: RoutineTemplateItemSnapshot,
  override: TemplateItemPrescriptionOverride | undefined
): Omit<ComposedRoutineExercise, 'sortOrder' | 'templateItemId' | 'extraId'> {
  if (!override) {
    return {
      exerciseId: item.exerciseId,
      sets: item.sets,
      reps: item.reps,
      speed: item.speed,
      durationSeconds: item.durationSeconds,
      distance: item.distance,
      weight: item.weight
    };
  }
  return {
    exerciseId: item.exerciseId,
    sets: override.sets ?? null,
    reps: override.reps ?? null,
    speed: override.speed ?? null,
    durationSeconds: override.durationSeconds ?? null,
    distance: override.distance ?? null,
    weight: override.weight ?? null
  };
}

/** Template items still on this weekday, then exercises added only on this user's routine. */
export function composeRoutineDayExercises(input: {
  templateItems: RoutineTemplateItemSnapshot[];
  excludedTemplateItemIds: Iterable<string>;
  overridesByTemplateItemId?: Map<string, TemplateItemPrescriptionOverride>;
  extras: RoutineExtraSnapshot[];
}): ComposedRoutineExercise[] {
  const excluded = new Set(input.excludedTemplateItemIds);
  const fromTemplate = [...input.templateItems]
    .filter((item) => !excluded.has(item.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const templateRows: ComposedRoutineExercise[] = fromTemplate.map((item) => ({
    ...applyOverride(item, input.overridesByTemplateItemId?.get(item.id)),
    sortOrder: item.sortOrder,
    templateItemId: item.id,
    extraId: null
  }));

  const extras = [...input.extras].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const extraBase = templateRows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const extraRows: ComposedRoutineExercise[] = extras.map((extra, index) => ({
    exerciseId: extra.exerciseId,
    sortOrder: extraBase + index,
    sets: extra.sets,
    reps: extra.reps,
    speed: extra.speed,
    durationSeconds: extra.durationSeconds,
    distance: extra.distance,
    weight: extra.weight,
    templateItemId: null,
    extraId: extra.id
  }));

  return [...templateRows, ...extraRows];
}

/** True when this removal leaves the weekday with no exercises, so the day becomes rest. */
export function removalEmptiesRoutineDay(input: {
  templateItemIds: string[];
  excludedTemplateItemIds: Iterable<string>;
  extraIds: string[];
  remove: { templateItemId: string } | { extraId: string };
}): boolean {
  const excluded = new Set(input.excludedTemplateItemIds);
  const visibleTemplate = input.templateItemIds.filter((id) => !excluded.has(id));
  let templateLeft = visibleTemplate.length;
  let extrasLeft = input.extraIds.length;

  if ('templateItemId' in input.remove) {
    if (visibleTemplate.includes(input.remove.templateItemId)) templateLeft -= 1;
  } else if (input.extraIds.includes(input.remove.extraId)) {
    extrasLeft -= 1;
  }

  return templateLeft + extrasLeft <= 0;
}

/**
 * A calendar day the person already changed (or logged) stays as they left it
 * the next time the weekly routine is applied.
 */
export function routineDateKeepsManualEdits(input: {
  exercisesManuallyEdited?: boolean | null;
  loggedWorkCount: number;
}): boolean {
  if (input.exercisesManuallyEdited) return true;
  return input.loggedWorkCount > 0;
}

/** Rest is an empty weekday. Added exercises keep the day active even without a plan template. */
export function routineWeekdayIsRest(day: {
  templateId: string | null;
  extraCount: number;
} | null | undefined): boolean {
  if (!day || day.templateId != null) return false;
  return day.extraCount === 0;
}

/** Usual sets and reps from the exercise catalog, for an add on this user's routine. */
export function catalogDefaultsToPrescription(exercise: {
  defaultSets?: number | null;
  defaultReps?: number | null;
  defaultDurationSeconds?: number | null;
  defaultDistance?: number | null;
}) {
  return {
    sets: exercise.defaultSets ?? null,
    reps: defaultRepsToScheme(exercise.defaultReps),
    speed: null as string | null,
    durationSeconds: exercise.defaultDurationSeconds ?? null,
    distance: exercise.defaultDistance ?? null,
    weight: null as number | null
  };
}
