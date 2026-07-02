import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileFromInput,
  buildTemplateMatchWhere,
  hasCompleteTemplateCriteria,
  isCompletePlanMatchProfile,
  templateMatchesProfile,
  templateSpecificityScore
} from './nutritionTemplateMatch.js';

describe('nutritionTemplateMatch', () => {
  const profile = {
    gender: 'f' as const,
    heightInches: 64,
    weightLbs: 135,
    activityLevel: 2
  };

  const matchingTemplate = {
    gender: 'f',
    heightMinInches: 62,
    heightMaxInches: 66,
    weightMinLbs: 125,
    weightMaxLbs: 145,
    activityLevelMin: 2,
    activityLevelMax: 3
  };

  it('builds a profile from setup-style input', () => {
    const built = buildProfileFromInput({
      gender: 'female',
      heightFeet: 5,
      heightInches: 4,
      weightLbs: 135,
      activityLevel: 2
    });
    assert.deepEqual(built, profile);
  });

  it('detects complete profiles and templates', () => {
    assert.equal(isCompletePlanMatchProfile(profile), true);
    assert.equal(hasCompleteTemplateCriteria(matchingTemplate), true);
    assert.equal(
      hasCompleteTemplateCriteria({ ...matchingTemplate, gender: null }),
      false
    );
  });

  it('matches inclusive range boundaries', () => {
    assert.equal(templateMatchesProfile(matchingTemplate, profile), true);
    assert.equal(
      templateMatchesProfile(matchingTemplate, { ...profile, heightInches: 62 }),
      true
    );
    assert.equal(
      templateMatchesProfile(matchingTemplate, { ...profile, heightInches: 67 }),
      false
    );
    assert.equal(
      templateMatchesProfile(matchingTemplate, { ...profile, gender: 'm' }),
      false
    );
  });

  it('prefers narrower template ranges', () => {
    const broad = templateSpecificityScore(matchingTemplate);
    const narrow = templateSpecificityScore({
      ...matchingTemplate,
      heightMinInches: 63,
      heightMaxInches: 65,
      weightMinLbs: 130,
      weightMaxLbs: 140,
      activityLevelMin: 2,
      activityLevelMax: 2
    });
    assert.ok(narrow < broad);
  });

  it('builds prisma where clauses for profile matching', () => {
    const where = buildTemplateMatchWhere(profile);
    assert.equal(where.gender, 'f');
    assert.deepEqual(where.heightMinInches, { lte: 64 });
    assert.deepEqual(where.heightMaxInches, { gte: 64 });
    assert.deepEqual(where.weightMinLbs, { lte: 135 });
    assert.deepEqual(where.weightMaxLbs, { gte: 135 });
    assert.deepEqual(where.activityLevelMin, { lte: 2 });
    assert.deepEqual(where.activityLevelMax, { gte: 2 });
  });
});
