import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  IMPORTED_EXERCISE_TAG_PREFIX,
  IMPORTED_NUTRITION_TAG_PREFIX,
  importedPlanTitle,
  renameImportedPlanTitle
} from './importedPlanTitle.js';

describe('imported plan titles', () => {
  it('drops the client name', () => {
    assert.equal(importedPlanTitle('meals', '2026-07-13'), 'Current meals (2026-07-13)');
    assert.equal(importedPlanTitle('workouts', '2026-08-28'), 'Current workouts (2026-08-28)');
  });

  it('renames only the imported name pattern', () => {
    assert.equal(
      renameImportedPlanTitle('Rachel George current meals (2026-07-13)'),
      'Current meals (2026-07-13)'
    );
    assert.equal(
      renameImportedPlanTitle('Joe B current workouts (2026-08-28)'),
      'Current workouts (2026-08-28)'
    );
    assert.equal(renameImportedPlanTitle('5 Day Split (#5)'), null);
    assert.equal(renameImportedPlanTitle('Current meals (2026-07-13)'), null);
    assert.equal(renameImportedPlanTitle('Rachel George current snacks (2026-07-13)'), null);
    assert.equal(renameImportedPlanTitle('Rachel George current meals (undated)'), null);
    assert.equal(renameImportedPlanTitle('  '), null);
  });

  it('migration SQL uses the same kinds, date shape, and import tags', () => {
    const sql = readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20261008180000_rename_imported_plan_titles/migration.sql'),
      'utf8'
    );
    assert.match(sql, /Current meals \(\\1\)/);
    assert.match(sql, /Current workouts \(\\1\)/);
    assert.match(sql, new RegExp(IMPORTED_NUTRITION_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(sql, new RegExp(IMPORTED_EXERCISE_TAG_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(sql, /\^.\+ current meals/);
    assert.match(sql, /\^.\+ current workouts/);
    assert.equal(sql.includes('NutritionTemplateMeal'), false);
    assert.equal(sql.includes('ExerciseTemplate'), false);
  });
});
