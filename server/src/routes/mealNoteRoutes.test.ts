import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { PrismaClient, Role, User } from '@prisma/client';

process.env.DATABASE_URL ??= 'postgresql://metabolic:metabolic_password@localhost:5433/metabolic';

type Actor = { id: string; role: Role };

function asUser(actor: Actor): User {
  return actor as User;
}

describe('meal note API', () => {
  let prisma: PrismaClient;
  let registerMealNoteRoutes: (app: FastifyInstance, authenticate?: preHandlerHookHandler) => void;
  let getMealsForDate: (userId: string, date: string) => Promise<Array<{ id: string; mealNumber: number; clientNote: string | null }>>;
  let dbReady = false;

  before(async () => {
    const db = await import('../db/prisma.js');
    prisma = db.prisma;
    const routes = await import('./mealNoteRoutes.js');
    registerMealNoteRoutes = routes.registerMealNoteRoutes;
    const nutrition = await import('../services/nutritionService.js');
    getMealsForDate = nutrition.getMealsForDate;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch (error) {
      dbReady = false;
      console.warn('Meal note persistence tests skipped: postgres is not reachable.', error);
    }
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  async function appFor(actor: Actor | null) {
    const { default: Fastify } = await import('fastify');
    const app = Fastify();
    app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
      reply.code(error.statusCode ?? 500).send({ error: error.message ?? 'Internal server error' });
    });
    if (actor) {
      registerMealNoteRoutes(app, async (request) => {
        request.appUser = asUser(actor);
      });
    } else {
      registerMealNoteRoutes(app);
    }
    return app;
  }

  async function createFixture() {
    const suffix = randomUUID();
    const client = await prisma.user.create({
      data: {
        firebaseUid: `meal-note-client-${suffix}`,
        email: `meal-note-client-${suffix}@test.local`,
        firstName: 'Casey',
        lastName: 'Client',
        role: 'USER'
      }
    });
    const coach = await prisma.user.create({
      data: {
        firebaseUid: `meal-note-coach-${suffix}`,
        email: `meal-note-coach-${suffix}@test.local`,
        firstName: 'Morgan',
        lastName: 'Coach',
        role: 'COACH'
      }
    });
    const stranger = await prisma.user.create({
      data: {
        firebaseUid: `meal-note-stranger-${suffix}`,
        email: `meal-note-stranger-${suffix}@test.local`,
        firstName: 'Sam',
        lastName: 'Stranger',
        role: 'USER'
      }
    });
    const admin = await prisma.user.create({
      data: {
        firebaseUid: `meal-note-admin-${suffix}`,
        email: `meal-note-admin-${suffix}@test.local`,
        firstName: 'Avery',
        lastName: 'Admin',
        role: 'ADMIN'
      }
    });
    const unassignedCoach = await prisma.user.create({
      data: {
        firebaseUid: `meal-note-unassigned-${suffix}`,
        email: `meal-note-unassigned-${suffix}@test.local`,
        firstName: 'Riley',
        lastName: 'Unassigned',
        role: 'COACH'
      }
    });
    await prisma.coachAssignment.create({
      data: { coachId: coach.id, userId: client.id, status: 'ACTIVE' }
    });
    const program = await prisma.program.create({
      data: {
        userId: client.id,
        name: 'Meal note test',
        status: 'ACTIVE',
        startDate: new Date('2026-10-01T00:00:00.000Z')
      }
    });
    const day = new Date('2026-10-02T00:00:00.000Z');
    const later = new Date('2026-10-05T00:00:00.000Z');
    const log = await prisma.dailyLog.create({
      data: {
        programId: program.id,
        userId: client.id,
        date: day,
        calorieTarget: 2000,
        proteinTarget: 150,
        carbTarget: 180,
        fatTarget: 60
      }
    });
    const laterLog = await prisma.dailyLog.create({
      data: {
        programId: program.id,
        userId: client.id,
        date: later,
        calorieTarget: 2000,
        proteinTarget: 150,
        carbTarget: 180,
        fatTarget: 60
      }
    });
    const breakfast = await prisma.meal.create({
      data: {
        dailyLogId: log.id,
        userId: client.id,
        mealNumber: 1,
        name: 'Breakfast',
        plannedTime: '08:00',
        plannedCalories: 400
      }
    });
    const snack = await prisma.meal.create({
      data: {
        dailyLogId: log.id,
        userId: client.id,
        mealNumber: 2,
        name: 'Snack',
        plannedCalories: 150
      }
    });
    const lunch = await prisma.meal.create({
      data: {
        dailyLogId: laterLog.id,
        userId: client.id,
        mealNumber: 3,
        name: 'Lunch',
        plannedCalories: 500
      }
    });

    return {
      client,
      coach,
      stranger,
      admin,
      unassignedCoach,
      log,
      breakfast,
      snack,
      lunch,
      async cleanup() {
        await prisma.user.deleteMany({
          where: { id: { in: [client.id, coach.id, stranger.id, admin.id, unassignedCoach.id] } }
        });
      }
    };
  }

  it('rejects unauthenticated note reads and writes', async () => {
    const app = await appFor(null);
    try {
      const put = await app.inject({ method: 'PUT', url: '/api/meals/missing/note', payload: { note: 'hello' } });
      const get = await app.inject({ method: 'GET', url: '/api/meals/missing/note' });
      const range = await app.inject({
        method: 'GET',
        url: '/api/users/missing/meal-notes?from=2026-10-01&to=2026-10-07'
      });
      assert.equal(put.statusCode, 401);
      assert.equal(get.statusCode, 401);
      assert.equal(range.statusCode, 401);
    } finally {
      await app.close();
    }
  });

  it('persists a client note on the meal slot and returns it with the day', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const app = await appFor(fixture.client);
    try {
      const created = await app.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: '  Extra oats on the side.  ' }
      });
      assert.equal(created.statusCode, 200);
      assert.deepEqual(created.json(), {
        mealId: fixture.breakfast.id,
        date: '2026-10-02',
        mealNumber: 1,
        note: 'Extra oats on the side.'
      });

      const read = await app.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(read.statusCode, 200);
      assert.equal(read.json().note, 'Extra oats on the side.');

      const meals = await getMealsForDate(fixture.client.id, '2026-10-02');
      assert.equal(meals.find((meal) => meal.mealNumber === 1)?.clientNote, 'Extra oats on the side.');
      assert.equal(meals.find((meal) => meal.mealNumber === 2)?.clientNote, null);

      const updated = await app.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Swap the oats for berries' }
      });
      assert.equal(updated.statusCode, 200);
      assert.equal(updated.json().note, 'Swap the oats for berries');

      const cleared = await app.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: '   ' }
      });
      assert.equal(cleared.statusCode, 200);
      assert.equal(cleared.json().note, null);
      const stored = await prisma.mealNote.count({ where: { userId: fixture.client.id } });
      assert.equal(stored, 0);
    } finally {
      await app.close();
      await fixture.cleanup();
    }
  });

  it('returns a note on an inactive meal once another meal has activity', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const app = await appFor(fixture.client);
    try {
      const dinner = await prisma.meal.create({
        data: {
          dailyLogId: fixture.log.id,
          userId: fixture.client.id,
          mealNumber: 4,
          name: 'Dinner',
          status: 'PLANNED',
          plannedCalories: 0
        }
      });
      const untouched = await prisma.meal.create({
        data: {
          dailyLogId: fixture.log.id,
          userId: fixture.client.id,
          mealNumber: 5,
          name: 'Evening',
          status: 'PLANNED',
          plannedCalories: 0
        }
      });
      const saved = await app.inject({
        method: 'PUT',
        url: `/api/meals/${dinner.id}/note`,
        payload: { note: 'Still need a plan' }
      });
      assert.equal(saved.statusCode, 200);

      const meals = await getMealsForDate(fixture.client.id, '2026-10-02');
      assert.equal(meals.find((meal) => meal.mealNumber === 4)?.clientNote, 'Still need a plan');
      assert.equal(meals.some((meal) => meal.id === untouched.id), false);
    } finally {
      await app.close();
      await fixture.cleanup();
    }
  });

  it('keeps empty slots visible when a note is the only day activity', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const app = await appFor(fixture.client);
    try {
      await prisma.meal.update({
        where: { id: fixture.breakfast.id },
        data: { plannedCalories: 0, actualCalories: 0, status: 'PLANNED' }
      });
      await prisma.meal.update({
        where: { id: fixture.snack.id },
        data: { plannedCalories: 0, actualCalories: 0, status: 'PLANNED' }
      });
      const saved = await app.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Prep oats tonight' }
      });
      assert.equal(saved.statusCode, 200);

      const meals = await getMealsForDate(fixture.client.id, '2026-10-02');
      assert.deepEqual(
        meals.map((meal) => meal.mealNumber),
        [1, 2]
      );
      assert.equal(meals.find((meal) => meal.mealNumber === 1)?.clientNote, 'Prep oats tonight');
    } finally {
      await app.close();
      await fixture.cleanup();
    }
  });

  it('keeps the note when the meal row is replaced', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const app = await appFor(fixture.client);
    try {
      const saved = await app.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Pack this the night before' }
      });
      assert.equal(saved.statusCode, 200);

      await prisma.meal.delete({ where: { id: fixture.breakfast.id } });
      const recreated = await prisma.meal.create({
        data: {
          dailyLogId: fixture.log.id,
          userId: fixture.client.id,
          mealNumber: 1,
          name: 'Breakfast',
          plannedCalories: 400
        }
      });
      assert.notEqual(recreated.id, fixture.breakfast.id);

      const meals = await getMealsForDate(fixture.client.id, '2026-10-02');
      assert.equal(meals.find((meal) => meal.id === recreated.id)?.clientNote, 'Pack this the night before');

      const read = await app.inject({ method: 'GET', url: `/api/meals/${recreated.id}/note` });
      assert.equal(read.statusCode, 200);
      assert.equal(read.json().note, 'Pack this the night before');
    } finally {
      await app.close();
      await fixture.cleanup();
    }
  });

  it('lists notes for a client and date range in day and meal order', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const app = await appFor(fixture.client);
    try {
      for (const [mealId, note] of [
        [fixture.snack.id, 'Apple, not crackers'],
        [fixture.breakfast.id, 'Oats'],
        [fixture.lunch.id, 'Leftovers']
      ] as const) {
        const response = await app.inject({
          method: 'PUT',
          url: `/api/meals/${mealId}/note`,
          payload: { note }
        });
        assert.equal(response.statusCode, 200);
      }

      const week = await app.inject({
        method: 'GET',
        url: `/api/users/${fixture.client.id}/meal-notes?from=2026-10-02&to=2026-10-05`
      });
      assert.equal(week.statusCode, 200);
      assert.deepEqual(week.json(), {
        notes: [
          { date: '2026-10-02', mealNumber: 1, note: 'Oats' },
          { date: '2026-10-02', mealNumber: 2, note: 'Apple, not crackers' },
          { date: '2026-10-05', mealNumber: 3, note: 'Leftovers' }
        ]
      });

      const partial = await app.inject({
        method: 'GET',
        url: `/api/users/${fixture.client.id}/meal-notes?from=2026-10-03&to=2026-10-04`
      });
      assert.deepEqual(partial.json(), { notes: [] });

      const backwards = await app.inject({
        method: 'GET',
        url: `/api/users/${fixture.client.id}/meal-notes?from=2026-10-06&to=2026-10-01`
      });
      assert.equal(backwards.statusCode, 400);

      const missing = await app.inject({
        method: 'GET',
        url: `/api/users/${fixture.client.id}/meal-notes`
      });
      assert.equal(missing.statusCode, 400);
    } finally {
      await app.close();
      await fixture.cleanup();
    }
  });

  it('lets the assigned coach and an admin write the same client note', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const clientApp = await appFor(fixture.client);
    const coachApp = await appFor(fixture.coach);
    const adminApp = await appFor(fixture.admin);
    try {
      const saved = await clientApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Travel day — keep it simple' }
      });
      assert.equal(saved.statusCode, 200);

      const coachRead = await coachApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(coachRead.statusCode, 200);
      assert.equal(coachRead.json().note, 'Travel day — keep it simple');

      const coachRange = await coachApp.inject({
        method: 'GET',
        url: `/api/users/${fixture.client.id}/meal-notes?from=2026-10-01&to=2026-10-07`
      });
      assert.equal(coachRange.statusCode, 200);
      assert.equal(coachRange.json().notes.length, 1);

      const coachWrite = await coachApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: '  Pack oats tonight.  ' }
      });
      assert.equal(coachWrite.statusCode, 200);
      assert.equal(coachWrite.json().note, 'Pack oats tonight.');

      const clientSeesCoach = await clientApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(clientSeesCoach.statusCode, 200);
      assert.equal(clientSeesCoach.json().note, 'Pack oats tonight.');
      const meals = await getMealsForDate(fixture.client.id, '2026-10-02');
      assert.equal(meals.find((meal) => meal.mealNumber === 1)?.clientNote, 'Pack oats tonight.');

      const tooLong = await coachApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'a'.repeat(2001) }
      });
      assert.equal(tooLong.statusCode, 400);
      const unchanged = await clientApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(unchanged.json().note, 'Pack oats tonight.');

      const adminRead = await adminApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(adminRead.statusCode, 200);
      const adminWrite = await adminApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.snack.id}/note`,
        payload: { note: 'Apple, not crackers' }
      });
      assert.equal(adminWrite.statusCode, 200);
      assert.equal(adminWrite.json().note, 'Apple, not crackers');

      const clientSeesAdmin = await clientApp.inject({ method: 'GET', url: `/api/meals/${fixture.snack.id}/note` });
      assert.equal(clientSeesAdmin.json().note, 'Apple, not crackers');

      const cleared = await coachApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: '   ' }
      });
      assert.equal(cleared.statusCode, 200);
      assert.equal(cleared.json().note, null);
      const breakfastGone = await clientApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(breakfastGone.json().note, null);
      const snackRemains = await prisma.mealNote.findUnique({
        where: {
          userId_date_mealNumber: {
            userId: fixture.client.id,
            date: new Date('2026-10-02T00:00:00.000Z'),
            mealNumber: 2
          }
        }
      });
      assert.equal(snackRemains?.note, 'Apple, not crackers');
    } finally {
      await clientApp.close();
      await coachApp.close();
      await adminApp.close();
      await fixture.cleanup();
    }
  });

  it('rejects an unassigned coach from writing a client meal note', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const clientApp = await appFor(fixture.client);
    const outsiderApp = await appFor(fixture.unassignedCoach);
    try {
      const saved = await clientApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Private to this coach assignment' }
      });
      assert.equal(saved.statusCode, 200);

      const write = await outsiderApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Should not land' }
      });
      const read = await outsiderApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(write.statusCode, 404);
      assert.equal(read.statusCode, 404);

      const still = await clientApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      assert.equal(still.json().note, 'Private to this coach assignment');
    } finally {
      await clientApp.close();
      await outsiderApp.close();
      await fixture.cleanup();
    }
  });

  it('hides notes from other clients', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const clientApp = await appFor(fixture.client);
    const strangerApp = await appFor(fixture.stranger);
    try {
      const saved = await clientApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Private' }
      });
      assert.equal(saved.statusCode, 200);

      const read = await strangerApp.inject({ method: 'GET', url: `/api/meals/${fixture.breakfast.id}/note` });
      const write = await strangerApp.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'Nope' }
      });
      const range = await strangerApp.inject({
        method: 'GET',
        url: `/api/users/${fixture.client.id}/meal-notes?from=2026-10-01&to=2026-10-07`
      });
      assert.equal(read.statusCode, 404);
      assert.equal(write.statusCode, 404);
      assert.equal(range.statusCode, 404);
    } finally {
      await clientApp.close();
      await strangerApp.close();
      await fixture.cleanup();
    }
  });

  it('rejects a note that is too long', async (t) => {
    if (!dbReady) return t.skip('postgres is not reachable');
    const fixture = await createFixture();
    const app = await appFor(fixture.client);
    try {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/meals/${fixture.breakfast.id}/note`,
        payload: { note: 'a'.repeat(2001) }
      });
      assert.equal(response.statusCode, 400);
      const stored = await prisma.mealNote.count({ where: { userId: fixture.client.id } });
      assert.equal(stored, 0);
    } finally {
      await app.close();
      await fixture.cleanup();
    }
  });
});
