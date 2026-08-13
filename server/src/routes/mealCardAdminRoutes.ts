import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';

/**
 * Card library authoring (admin). The library is the product's entire menu once
 * template food retires, so this is Tommy's card-management surface. Portions are
 * authored as baseServings at the set's referenceCalories; the client previews
 * scaled portions locally with the same math the serve-time resolver uses.
 */

const adminOnly = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];

const setInclude = {
  cards: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      options: {
        orderBy: { sortOrder: 'asc' as const },
        include: { foods: { include: { food: true } } }
      }
    }
  },
  _count: { select: { templateMeals: true, userPicks: true } }
};

const slotTypeSchema = z.enum(['BREAKFAST', 'SNACK', 'LUNCH', 'DINNER']);
const roleSchema = z.enum(['STYLE', 'PROTEIN', 'FAT', 'CARB', 'VEGETABLE', 'FRUIT', 'FREE']);

const setBodySchema = z.object({
  name: z.string().min(1).max(80),
  slotType: slotTypeSchema,
  referenceCalories: z.number().positive().max(3000)
});

const cardBodySchema = z.object({
  role: roleSchema,
  name: z.string().min(1).max(60),
  pickRule: z.string().max(120).nullable().optional(),
  required: z.boolean().optional(),
  maxSelect: z.number().int().min(1).max(10).optional(),
  visibleWhenOptionId: z.string().min(1).nullable().optional(),
  hiddenForOptionIds: z.array(z.string().min(1)).optional()
});

const optionBodySchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(160).nullable().optional(),
  icon: z.string().max(8).nullable().optional(),
  isDefault: z.boolean().optional(),
  visibleWhenOptionId: z.string().min(1).nullable().optional()
});

/** Gate must be an option on an earlier card in the same set (or null to clear). */
async function assertVisibleWhenGate(
  cardSetId: string,
  cardSortOrder: number,
  optionId: string | null,
  gateId: string | null
) {
  if (gateId == null) return;
  if (optionId && gateId === optionId) {
    throw Object.assign(new Error('An option cannot depend on itself'), { statusCode: 400 });
  }
  const gate = await prisma.mealCardOption.findUnique({
    where: { id: gateId },
    select: { id: true, card: { select: { sortOrder: true, cardSetId: true } } }
  });
  if (!gate) throw Object.assign(new Error('Visibility gate option not found'), { statusCode: 400 });
  if (gate.card.cardSetId !== cardSetId) {
    throw Object.assign(new Error('Visibility gate must be in the same card set'), { statusCode: 400 });
  }
  if (gate.card.sortOrder >= cardSortOrder) {
    throw Object.assign(new Error('Visibility gate must be on an earlier step'), { statusCode: 400 });
  }
}

async function assertHiddenForOptionIds(cardSetId: string, cardSortOrder: number, hiddenIds: string[]) {
  for (const gateId of hiddenIds) {
    await assertVisibleWhenGate(cardSetId, cardSortOrder, null, gateId);
  }
}

const optionFoodBodySchema = z.object({
  foodId: z.string().min(1),
  baseServings: z.number().positive().max(50),
  scalable: z.boolean().optional(),
  discrete: z.boolean().optional(),
  unitStep: z.number().positive().max(10).optional(),
  minServings: z.number().positive().nullable().optional(),
  maxServings: z.number().positive().nullable().optional()
});

function notFound(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  return reply.code(404).send({ error: 'Not found' });
}

/** Setting one option default clears its siblings — exactly one default per card. */
async function setDefaultExclusive(optionId: string, cardId: string) {
  await prisma.$transaction([
    prisma.mealCardOption.updateMany({ where: { cardId, NOT: { id: optionId } }, data: { isDefault: false } }),
    prisma.mealCardOption.update({ where: { id: optionId }, data: { isDefault: true } })
  ]);
}

export async function mealCardAdminRoutes(app: FastifyInstance) {
  /* ---------- sets ---------- */
  app.get('/api/admin/card-sets', { preHandler: adminOnly }, async () =>
    prisma.mealCardSet.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { cards: true, templateMeals: true, userPicks: true } } }
    })
  );

  app.post('/api/admin/card-sets', { preHandler: adminOnly }, async (request) => {
    const body = setBodySchema.parse(request.body);
    return prisma.mealCardSet.create({
      data: { ...body, createdById: request.appUser!.id },
      include: setInclude
    });
  });

  app.get('/api/admin/card-sets/:id', { preHandler: adminOnly }, async (request, reply) => {
    const set = await prisma.mealCardSet.findUnique({
      where: { id: (request.params as { id: string }).id },
      include: setInclude
    });
    return set ?? notFound(reply);
  });

  app.patch('/api/admin/card-sets/:id', { preHandler: adminOnly }, async (request) => {
    const body = setBodySchema.partial().parse(request.body);
    return prisma.mealCardSet.update({
      where: { id: (request.params as { id: string }).id },
      data: body,
      include: setInclude
    });
  });

  app.delete('/api/admin/card-sets/:id', { preHandler: adminOnly }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const usage = await prisma.mealCardSet.findUnique({
      where: { id },
      select: { _count: { select: { templateMeals: true, userPicks: true } } }
    });
    if (!usage) return notFound(reply);
    if (usage._count.templateMeals > 0) {
      return reply.code(409).send({
        error: `This set backs ${usage._count.templateMeals} plan meal slot(s) — detach it before deleting.`
      });
    }
    await prisma.mealCardSet.delete({ where: { id } });
    return { deleted: true };
  });

  /* ---------- cards ---------- */
  app.post('/api/admin/card-sets/:id/cards', { preHandler: adminOnly }, async (request, reply) => {
    const setId = (request.params as { id: string }).id;
    const body = cardBodySchema.parse(request.body);
    const max = await prisma.mealCard.aggregate({ where: { cardSetId: setId }, _max: { sortOrder: true } });
    const sortOrder = (max._max.sortOrder ?? 0) + 1;
    try {
      await assertVisibleWhenGate(setId, sortOrder, null, body.visibleWhenOptionId ?? null);
      if (body.hiddenForOptionIds?.length) {
        await assertHiddenForOptionIds(setId, sortOrder, body.hiddenForOptionIds);
      }
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      return reply.code(status).send({ error: err instanceof Error ? err.message : 'Invalid visibility gate' });
    }
    if (body.visibleWhenOptionId && body.hiddenForOptionIds?.includes(body.visibleWhenOptionId)) {
      return reply.code(400).send({ error: 'A step cannot be both gated to and hidden for the same option' });
    }
    return prisma.mealCard.create({
      data: { cardSetId: setId, sortOrder, ...body },
      include: { options: { include: { foods: { include: { food: true } } } } }
    });
  });

  app.patch('/api/admin/cards/:id', { preHandler: adminOnly }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = cardBodySchema.partial().parse(request.body);
    const card = await prisma.mealCard.findUnique({
      where: { id },
      select: { cardSetId: true, sortOrder: true, visibleWhenOptionId: true, hiddenForOptionIds: true }
    });
    if (!card) return notFound(reply);
    try {
      if (body.visibleWhenOptionId !== undefined) {
        await assertVisibleWhenGate(card.cardSetId, card.sortOrder, null, body.visibleWhenOptionId);
      }
      if (body.hiddenForOptionIds) {
        await assertHiddenForOptionIds(card.cardSetId, card.sortOrder, body.hiddenForOptionIds);
      }
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      return reply.code(status).send({ error: err instanceof Error ? err.message : 'Invalid visibility gate' });
    }
    const nextVisible = body.visibleWhenOptionId !== undefined ? body.visibleWhenOptionId : card.visibleWhenOptionId;
    const nextHidden = body.hiddenForOptionIds ?? card.hiddenForOptionIds;
    if (nextVisible && nextHidden.includes(nextVisible)) {
      return reply.code(400).send({ error: 'A step cannot be both gated to and hidden for the same option' });
    }
    return prisma.mealCard.update({ where: { id }, data: body });
  });

  app.post('/api/admin/cards/:id/move', { preHandler: adminOnly }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(request.body);
    const card = await prisma.mealCard.findUnique({ where: { id } });
    if (!card) return notFound(reply);
    const neighbor = await prisma.mealCard.findFirst({
      where: {
        cardSetId: card.cardSetId,
        sortOrder: direction === 'up' ? { lt: card.sortOrder } : { gt: card.sortOrder }
      },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' }
    });
    if (!neighbor) return { moved: false };
    // Swap via a temp slot to respect the (cardSetId, sortOrder) unique constraint.
    await prisma.$transaction(async (tx) => {
      await tx.mealCard.update({ where: { id: card.id }, data: { sortOrder: -1 } });
      await tx.mealCard.update({ where: { id: neighbor.id }, data: { sortOrder: card.sortOrder } });
      await tx.mealCard.update({ where: { id: card.id }, data: { sortOrder: neighbor.sortOrder } });
    });
    return { moved: true };
  });

  app.delete('/api/admin/cards/:id', { preHandler: adminOnly }, async (request) => {
    await prisma.mealCard.delete({ where: { id: (request.params as { id: string }).id } });
    return { deleted: true };
  });

  /* ---------- options ---------- */
  app.post('/api/admin/cards/:id/options', { preHandler: adminOnly }, async (request, reply) => {
    const cardId = (request.params as { id: string }).id;
    const body = optionBodySchema.parse(request.body);
    const card = await prisma.mealCard.findUnique({
      where: { id: cardId },
      select: { cardSetId: true, sortOrder: true }
    });
    if (!card) return notFound(reply);
    try {
      await assertVisibleWhenGate(card.cardSetId, card.sortOrder, null, body.visibleWhenOptionId ?? null);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      return reply.code(status).send({ error: err instanceof Error ? err.message : 'Invalid visibility gate' });
    }
    const max = await prisma.mealCardOption.aggregate({ where: { cardId }, _max: { sortOrder: true } });
    const { isDefault, ...data } = body;
    const created = await prisma.mealCardOption.create({
      data: { cardId, sortOrder: (max._max.sortOrder ?? 0) + 1, ...data, isDefault: false },
      include: { foods: { include: { food: true } } }
    });
    if (isDefault) await setDefaultExclusive(created.id, cardId);
    return created;
  });

  app.patch('/api/admin/options/:id', { preHandler: adminOnly }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = optionBodySchema.partial().parse(request.body);
    const option = await prisma.mealCardOption.findUnique({
      where: { id },
      select: { cardId: true, card: { select: { cardSetId: true, sortOrder: true } } }
    });
    if (!option) return notFound(reply);
    if (body.visibleWhenOptionId !== undefined) {
      try {
        await assertVisibleWhenGate(option.card.cardSetId, option.card.sortOrder, id, body.visibleWhenOptionId);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 400;
        return reply.code(status).send({ error: err instanceof Error ? err.message : 'Invalid visibility gate' });
      }
    }
    const { isDefault, ...rest } = body;
    const updated = await prisma.mealCardOption.update({ where: { id }, data: rest });
    if (isDefault === true) await setDefaultExclusive(id, option.cardId);
    if (isDefault === false) await prisma.mealCardOption.update({ where: { id }, data: { isDefault: false } });
    return updated;
  });

  app.delete('/api/admin/options/:id', { preHandler: adminOnly }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const option = await prisma.mealCardOption.findUnique({
      where: { id },
      select: { card: { select: { cardSetId: true } } }
    });
    if (!option) return notFound(reply);
    const cardSetId = option.card.cardSetId;
    await prisma.$transaction(async (tx) => {
      await tx.mealCardOption.delete({ where: { id } });
      const hiddenOn = await tx.mealCard.findMany({
        where: { cardSetId, hiddenForOptionIds: { has: id } },
        select: { id: true, hiddenForOptionIds: true }
      });
      for (const card of hiddenOn) {
        await tx.mealCard.update({
          where: { id: card.id },
          data: { hiddenForOptionIds: card.hiddenForOptionIds.filter((optionId) => optionId !== id) }
        });
      }
    });
    return { deleted: true };
  });

  /* ---------- option foods ---------- */
  app.post('/api/admin/options/:id/foods', { preHandler: adminOnly }, async (request) => {
    const optionId = (request.params as { id: string }).id;
    const body = optionFoodBodySchema.parse(request.body);
    return prisma.mealCardOptionFood.create({
      data: { optionId, ...body },
      include: { food: true }
    });
  });

  app.patch('/api/admin/option-foods/:id', { preHandler: adminOnly }, async (request) => {
    const body = optionFoodBodySchema.partial().omit({ foodId: true }).parse(request.body);
    return prisma.mealCardOptionFood.update({
      where: { id: (request.params as { id: string }).id },
      data: body,
      include: { food: true }
    });
  });

  app.delete('/api/admin/option-foods/:id', { preHandler: adminOnly }, async (request) => {
    await prisma.mealCardOptionFood.delete({ where: { id: (request.params as { id: string }).id } });
    return { deleted: true };
  });
}
