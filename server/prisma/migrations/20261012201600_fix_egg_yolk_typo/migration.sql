-- Correct the cooked-egg food name. Existing snapshots keep the old spelling until this runs.
UPDATE "Food"
SET "name" = replace("name", 'Yoke', 'Yolk')
WHERE "name" LIKE '%Yoke%';

UPDATE "FoodAlias"
SET "alias" = replace("alias", 'Yoke', 'Yolk')
WHERE "alias" LIKE '%Yoke%';

UPDATE "MealItem"
SET "nameSnapshot" = replace("nameSnapshot", 'Yoke', 'Yolk')
WHERE "nameSnapshot" LIKE '%Yoke%';
