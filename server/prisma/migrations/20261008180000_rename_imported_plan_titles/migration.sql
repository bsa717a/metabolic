-- Rename imported legacy plan titles from "{client} current {kind} (YYYY-MM-DD)"
-- to "Current {kind} (YYYY-MM-DD)". Kinds are the ones currentPlanTitle emits:
-- meals (NutritionPlanTemplate) and workouts (ExercisePlan).
-- The description tag is how the importer marks those rows. Library plans and
-- any other template whose name merely looks similar are left alone.
-- An already-renamed "Current meals (…)" does not match, because the pattern
-- requires a client name before " current ".

UPDATE "NutritionPlanTemplate"
SET "name" = regexp_replace(
  "name",
  '^.+ current meals \(([0-9]{4}-[0-9]{2}-[0-9]{2})\)$',
  'Current meals (\1)'
)
WHERE "description" LIKE 'mmv1:nutritionProgram:%'
  AND "name" ~ '^.+ current meals \([0-9]{4}-[0-9]{2}-[0-9]{2}\)$';

UPDATE "ExercisePlan"
SET "name" = regexp_replace(
  "name",
  '^.+ current workouts \(([0-9]{4}-[0-9]{2}-[0-9]{2})\)$',
  'Current workouts (\1)'
)
WHERE "description" LIKE 'mmv1:exerciseProgram:%'
  AND "name" ~ '^.+ current workouts \([0-9]{4}-[0-9]{2}-[0-9]{2}\)$';
