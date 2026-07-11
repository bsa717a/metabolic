import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FeedbackSeverity, FeedbackStatus, FeedbackType, Role } from '@prisma/client';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';
import {
  addNote,
  findSimilar,
  getReport,
  listReports,
  updateReport,
  FeedbackError
} from '../services/feedbackService.js';
import { notifyTester } from '../services/feedbackNotificationService.js';

const adminOnly = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];

function notFoundOr(error: unknown, reply: import('fastify').FastifyReply) {
  if (error instanceof FeedbackError) {
    const code = error.message.includes('not found') ? 404 : 400;
    return reply.code(code).send({ error: error.message });
  }
  throw error;
}

const listQuery = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  type: z.nativeEnum(FeedbackType).optional(),
  blocking: z.enum(['true', 'false']).optional(),
  assignedToId: z.string().optional(),
  appVersion: z.string().optional(),
  search: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

const updateBody = z.object({
  status: z.nativeEnum(FeedbackStatus).optional(),
  severity: z.nativeEnum(FeedbackSeverity).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  duplicateOfId: z.string().nullable().optional(),
  resolutionNote: z.string().max(4000).nullable().optional(),
  externalRef: z.string().max(500).nullable().optional()
});

export async function feedbackAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/feedback', { preHandler: adminOnly }, async (request, reply) => {
    const q = listQuery.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: 'Invalid filters.' });
    const { page, pageSize, blocking, from, to, ...rest } = q.data;
    return listReports(
      {
        ...rest,
        blocking: blocking === undefined ? undefined : blocking === 'true',
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined
      },
      { page, pageSize }
    );
  });

  // Admin users available for assignment.
  app.get('/api/admin/feedback/assignees', { preHandler: adminOnly }, async () => {
    const admins = await prisma.user.findMany({
      where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' }
    });
    return admins.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}`.trim() }));
  });

  app.get('/api/admin/feedback/:id', { preHandler: adminOnly }, async (request, reply) => {
    try {
      const report = await getReport((request.params as { id: string }).id);
      const similar = await findSimilar(report.id);
      return { ...report, similar };
    } catch (error) {
      return notFoundOr(error, reply);
    }
  });

  app.patch('/api/admin/feedback/:id', { preHandler: adminOnly }, async (request, reply) => {
    const body = updateBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid update.' });
    try {
      return await updateReport(request.appUser!.id, (request.params as { id: string }).id, body.data);
    } catch (error) {
      return notFoundOr(error, reply);
    }
  });

  app.post('/api/admin/feedback/:id/notes', { preHandler: adminOnly }, async (request, reply) => {
    const body = z.object({ body: z.string().min(1).max(4000) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Note cannot be empty.' });
    try {
      return await addNote(request.appUser!.id, (request.params as { id: string }).id, body.data.body);
    } catch (error) {
      return notFoundOr(error, reply);
    }
  });

  app.post('/api/admin/feedback/:id/notify', { preHandler: adminOnly }, async (request, reply) => {
    const body = z
      .object({ reason: z.enum(['need_info', 'resolved']), message: z.string().min(1).max(4000) })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'A reason and message are required.' });
    try {
      return await notifyTester(request.appUser!.id, (request.params as { id: string }).id, body.data.reason, body.data.message);
    } catch (error) {
      return notFoundOr(error, reply);
    }
  });

  app.get('/api/admin/feedback/:id/export', { preHandler: adminOnly }, async (request, reply) => {
    try {
      const report = await getReport((request.params as { id: string }).id);
      reply.header('Content-Disposition', `attachment; filename="${report.reference}.json"`);
      return report;
    } catch (error) {
      return notFoundOr(error, reply);
    }
  });
}
