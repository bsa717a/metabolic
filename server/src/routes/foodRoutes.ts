import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';
import { getFoodsByGroup } from '../services/foodGroupService.js';
import { searchFoods } from '../services/foodSearchService.js';

const foodBody = z.object({ name: z.string(), servingSize: z.number().default(1), servingUnit: z.string().default('serving'), calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), brand: z.string().optional() });

export async function foodRoutes(app: FastifyInstance) {
  app.get('/api/foods/recent', { preHandler: requireAuth }, async (request) => {
    const limit = Math.min(Number((request.query as { limit?: string }).limit ?? 10), 25);
    const recentItems = await prisma.mealItem.findMany({
      where: { meal: { userId: request.appUser!.id }, foodId: { not: null }, type: 'PLANNED' },
      orderBy: { createdAt: 'desc' },
      distinct: ['foodId'],
      take: limit,
      include: { food: true }
    });
    return recentItems.filter((item) => item.food).map((item) => item.food!);
  });

  app.get('/api/foods/search', { preHandler: requireAuth }, async (request) => {
    const query = String((request.query as { query?: string }).query ?? '').trim();
    return searchFoods(request.appUser!.id, query);
  });

  app.get('/api/foods/by-group', { preHandler: requireAuth }, async (request) => {
    return getFoodsByGroup(request.appUser!.id);
  });

  app.get('/api/foods', { preHandler: requireAuth }, async (request) => {
    const query = String((request.query as { query?: string }).query ?? '').trim();
    if (query.length < 2) return [];

    return prisma.food.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { brand: { contains: query, mode: 'insensitive' } },
              { aliases: { some: { alias: { contains: query, mode: 'insensitive' } } } }
            ]
          },
          { OR: [{ visibility: 'GLOBAL' }, { ownerUserId: request.appUser!.id }] }
        ]
      },
      take: 25,
      orderBy: { name: 'asc' }
    });
  });
  app.post('/api/foods', { preHandler: requireAuth }, async (request) => {
    const body = foodBody.parse(request.body);
    return prisma.food.create({ data: { ...body, ownerUserId: request.appUser!.id, createdById: request.appUser!.id } });
  });
  app.patch('/api/foods/:id', { preHandler: requireAuth }, async (request) => prisma.food.update({ where: { id: (request.params as { id: string }).id }, data: request.body as object }));
  app.post('/api/foods/:id/verify', { preHandler: [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])] }, async (request) => prisma.food.update({ where: { id: (request.params as { id: string }).id }, data: { verified: true, source: 'VERIFIED' } }));
  app.post('/api/foods/:id/make-global', { preHandler: [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])] }, async (request) => prisma.food.update({ where: { id: (request.params as { id: string }).id }, data: { visibility: 'GLOBAL', verified: true } }));
}
