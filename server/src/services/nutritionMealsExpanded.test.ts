import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgresql://metabolic:metabolic_password@localhost:5433/metabolic';

describe('nutrition meals expanded', () => {
  let prisma: PrismaClient;
  let setNutritionMealsExpanded: (userId: string, expanded: boolean) => Promise<{ nutritionMealsExpanded: boolean }>;
  let nutritionMealsExpandedBody: { safeParse: (body: unknown) => { success: boolean } };
  let dbReady = false;

  before(async () => {
    const db = await import('../db/prisma.js');
    prisma = db.prisma;
    const service = await import('./nutritionMealsExpanded.js');
    setNutritionMealsExpanded = service.setNutritionMealsExpanded;
    nutritionMealsExpandedBody = service.nutritionMealsExpandedBody;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch (error) {
      dbReady = false;
      console.warn('Nutrition meals expanded persistence test skipped: postgres is not reachable.', error);
    }
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it('accepts only a boolean expanded flag', () => {
    assert.equal(nutritionMealsExpandedBody.safeParse({ expanded: true }).success, true);
    assert.equal(nutritionMealsExpandedBody.safeParse({ expanded: false }).success, true);
    assert.equal(nutritionMealsExpandedBody.safeParse({ expanded: 'true' }).success, false);
    assert.equal(nutritionMealsExpandedBody.safeParse({}).success, false);
  });

  it('stores the choice on the user and defaults new users to collapsed', async () => {
    if (!dbReady) return;
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        firebaseUid: `meals-expanded-${suffix}`,
        email: `meals-expanded-${suffix}@test.local`,
        firstName: 'Amy',
        lastName: 'Tester',
        role: 'USER'
      }
    });
    try {
      assert.equal(user.nutritionMealsExpanded, false);
      const expanded = await setNutritionMealsExpanded(user.id, true);
      assert.equal(expanded.nutritionMealsExpanded, true);
      const collapsed = await setNutritionMealsExpanded(user.id, false);
      assert.equal(collapsed.nutritionMealsExpanded, false);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
