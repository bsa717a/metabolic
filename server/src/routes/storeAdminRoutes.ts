import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StoreOrderStatus, StoreProductCategory } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import {
  createProduct,
  listAllOrders,
  listAllProducts,
  markOrderFulfilled,
  moveProduct,
  StoreAdminError,
  updateProduct
} from '../services/storeAdminService.js';

const adminOnly = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];

const categorySchema = z.nativeEnum(StoreProductCategory);

const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(600),
  category: categorySchema,
  priceCents: z.number().int().min(0).max(10_000_000),
  imageUrl: z.string().trim().url().max(2000).nullable().optional(),
  active: z.boolean().optional()
});

const productUpdateSchema = productCreateSchema
  .partial()
  .extend({ sortOrder: z.number().int().min(0).optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required.' });

export async function storeAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/store/products', { preHandler: adminOnly }, async () => listAllProducts());

  app.post('/api/admin/store/products', { preHandler: adminOnly }, async (request, reply) => {
    const body = productCreateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid product.' });
    return createProduct(body.data);
  });

  app.patch('/api/admin/store/products/:id', { preHandler: adminOnly }, async (request, reply) => {
    const body = productUpdateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Invalid update.' });
    try {
      return await updateProduct((request.params as { id: string }).id, body.data);
    } catch (error) {
      if (error instanceof StoreAdminError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  app.post('/api/admin/store/products/:id/move', { preHandler: adminOnly }, async (request, reply) => {
    const body = z.object({ direction: z.enum(['up', 'down']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'direction must be "up" or "down".' });
    try {
      return await moveProduct((request.params as { id: string }).id, body.data.direction);
    } catch (error) {
      if (error instanceof StoreAdminError) return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  app.get('/api/admin/store/orders', { preHandler: adminOnly }, async (request, reply) => {
    const query = z
      .object({
        status: z.nativeEnum(StoreOrderStatus).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50)
      })
      .safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.issues[0]?.message ?? 'Invalid pagination.' });
    }
    const statuses = query.data.status ? [query.data.status] : undefined;
    return listAllOrders(statuses, { page: query.data.page, pageSize: query.data.pageSize });
  });

  app.post('/api/admin/store/orders/:id/fulfill', { preHandler: adminOnly }, async (request, reply) => {
    try {
      return await markOrderFulfilled((request.params as { id: string }).id);
    } catch (error) {
      if (error instanceof StoreAdminError) {
        const code = error.message.includes('not found') ? 404 : 409;
        return reply.code(code).send({ error: error.message });
      }
      throw error;
    }
  });
}
