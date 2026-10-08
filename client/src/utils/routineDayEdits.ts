import type {
  ExerciseRoutineDayExtra,
  ExerciseRoutineDayItemOverride,
  ExerciseTemplateItem
} from '../types';

export type RoutineDayExerciseView = {
  key: string;
  name: string;
  exerciseId: string;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
  source: 'template' | 'extra';
  templateItemId?: string;
  extraId?: string;
};

/** Rest is a weekday with no plan workout and no exercises added on this routine. */
export function routineWeekdayIsRest(day: {
  templateId: string | null;
  extras?: unknown[] | null;
} | null | undefined): boolean {
  if (!day || day.templateId != null) return false;
  return (day.extras?.length ?? 0) === 0;
}

function mergeOverride(
  item: ExerciseTemplateItem,
  overrides: ExerciseRoutineDayItemOverride[]
): ExerciseTemplateItem {
  const override = overrides.find((entry) => entry.templateItemId === item.id);
  if (!override) return item;
  return {
    ...item,
    sets: override.sets !== undefined ? override.sets : item.sets,
    reps: override.reps !== undefined ? override.reps : item.reps,
    speed: override.speed !== undefined ? override.speed : item.speed,
    durationSeconds:
      override.durationSeconds !== undefined ? override.durationSeconds : item.durationSeconds,
    distance: override.distance !== undefined ? override.distance : item.distance,
    weight: override.weight !== undefined ? override.weight : item.weight
  };
}

function viewFromTemplate(item: ExerciseTemplateItem): RoutineDayExerciseView {
  return {
    key: `template:${item.id}`,
    name: item.exercise.name,
    exerciseId: item.exerciseId,
    sets: item.sets ?? null,
    reps: item.reps ?? null,
    speed: item.speed ?? null,
    durationSeconds: item.durationSeconds ?? null,
    distance: item.distance ?? null,
    weight: item.weight ?? null,
    source: 'template',
    templateItemId: item.id
  };
}

function viewFromExtra(extra: ExerciseRoutineDayExtra): RoutineDayExerciseView {
  return {
    key: `extra:${extra.id}`,
    name: extra.exercise.name,
    exerciseId: extra.exerciseId,
    sets: extra.sets ?? null,
    reps: extra.reps ?? null,
    speed: extra.speed ?? null,
    durationSeconds: extra.durationSeconds ?? null,
    distance: extra.distance ?? null,
    weight: extra.weight ?? null,
    source: 'extra',
    extraId: extra.id
  };
}

/** Plan exercises still on this weekday, then exercises added only on this routine. */
export function visibleRoutineDayExercises(input: {
  templateItems: ExerciseTemplateItem[] | null;
  excludedTemplateItemIds?: string[] | null;
  itemOverrides?: ExerciseRoutineDayItemOverride[] | null;
  extras?: ExerciseRoutineDayExtra[] | null;
}): RoutineDayExerciseView[] {
  const excluded = new Set(input.excludedTemplateItemIds ?? []);
  const overrides = input.itemOverrides ?? [];
  const fromTemplate = (input.templateItems ?? [])
    .filter((item) => !excluded.has(item.id))
    .map((item) => viewFromTemplate(mergeOverride(item, overrides)));
  const fromExtras = [...(input.extras ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(viewFromExtra);
  return [...fromTemplate, ...fromExtras];
}
