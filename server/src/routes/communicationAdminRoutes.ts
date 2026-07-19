import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';
import { generateOrRefineEmail } from '../services/communications/aiEmail.js';
import {
  COMMUNICATION_CATEGORY_META,
  COMMUNICATION_STATUS
} from '../services/communications/categories.js';
import { evaluateEligibility, sendCommunication } from '../services/communications/sendService.js';
import {
  ALLOWED_TYPES,
  downloadCommunicationAsset,
  MAX_BYTES,
  uploadCommunicationAsset
} from '../services/communications/storage.js';
import {
  getFilterOptions,
  searchAllCommunicationUsers,
  searchCommunicationUsers,
  searchRecipientsByQuery
} from '../services/communications/userSearch.js';
import {
  normalizeBody,
  normalizeBodyDesign,
  normalizeRecipients,
  validateCommunicationPayload,
  validateTemplatePayload
} from '../services/communications/validation.js';

const adminOnly = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];

const UNLAYER_EMBED_URL = 'https://editor.unlayer.com/embed.js?2';

export const communicationAdminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/admin/communications/categories', { preHandler: adminOnly }, async () => ({
    categories: Object.entries(COMMUNICATION_CATEGORY_META).map(([value, meta]) => ({
      value,
      label: meta.label,
      allowsUnsubscribe: meta.allowsUnsubscribe
    }))
  }));

  app.get('/api/admin/communications/filter-options', { preHandler: adminOnly }, async () =>
    getFilterOptions()
  );

  app.get('/api/admin/communications/recipients/search', { preHandler: adminOnly }, async (request) => {
    const { q } = request.query as { q?: string };
    const results = await searchRecipientsByQuery(q || '');
    return { results };
  });

  app.get('/api/admin/communications/users', { preHandler: adminOnly }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return searchCommunicationUsers({
      q: query.q,
      role: query.role,
      status: query.status,
      plan: query.plan,
      organizationId: query.organizationId,
      subscription: query.subscription,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined
    });
  });

  app.get('/api/admin/communications/users/all', { preHandler: adminOnly }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return searchAllCommunicationUsers({
      q: query.q,
      role: query.role,
      status: query.status,
      plan: query.plan,
      organizationId: query.organizationId,
      subscription: query.subscription
    });
  });

  app.get('/api/admin/communications/drafts', { preHandler: adminOnly }, async () => {
    const drafts = await prisma.communication.findMany({
      where: { status: COMMUNICATION_STATUS.DRAFT, deletedAt: null },
      orderBy: { updatedAt: 'desc' }
    });
    return { drafts };
  });

  app.post('/api/admin/communications/drafts', { preHandler: adminOnly }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const errors = validateCommunicationPayload(body as never);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const actorId = request.appUser!.id;
    const draft = await prisma.communication.create({
      data: {
        subject: (body.subject as string) || null,
        body: normalizeBody(body.body as string) as string,
        bodyDesign: normalizeBodyDesign(body.bodyDesign) as object | undefined,
        channel: body.channel as string,
        category: body.category as string,
        status: COMMUNICATION_STATUS.DRAFT,
        recipientsJson: normalizeRecipients(body.recipients as never) as object[],
        createdBy: actorId,
        updatedBy: actorId
      }
    });
    return { draft };
  });

  app.put('/api/admin/communications/drafts/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const errors = validateCommunicationPayload(body as never);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const existing = await prisma.communication.findFirst({
      where: { id, deletedAt: null, status: COMMUNICATION_STATUS.DRAFT }
    });
    if (!existing) return reply.code(404).send({ error: 'Draft not found' });

    const draft = await prisma.communication.update({
      where: { id },
      data: {
        subject: (body.subject as string) || null,
        body: normalizeBody(body.body as string) as string,
        bodyDesign: normalizeBodyDesign(body.bodyDesign) as object | undefined,
        channel: body.channel as string,
        category: body.category as string,
        recipientsJson: normalizeRecipients(body.recipients as never) as object[],
        updatedBy: request.appUser!.id
      }
    });
    return { draft };
  });

  app.delete('/api/admin/communications/drafts/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.communication.findFirst({
      where: { id, deletedAt: null, status: COMMUNICATION_STATUS.DRAFT }
    });
    if (!existing) return reply.code(404).send({ error: 'Draft not found' });

    await prisma.communication.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: request.appUser!.id }
    });
    return { success: true };
  });

  app.get('/api/admin/communications/templates', { preHandler: adminOnly }, async () => {
    const templates = await prisma.communicationTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' }
    });
    return { templates };
  });

  app.post('/api/admin/communications/templates', { preHandler: adminOnly }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const errors = validateTemplatePayload(body as never);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const actorId = request.appUser!.id;
    const template = await prisma.communicationTemplate.create({
      data: {
        name: String(body.name).trim(),
        subject: (body.subject as string) || null,
        body: normalizeBody(body.body as string) as string,
        bodyDesign: normalizeBodyDesign(body.bodyDesign) as object | undefined,
        channel: (body.channel as string) || 'email',
        category: body.category as string,
        createdBy: actorId,
        updatedBy: actorId
      }
    });
    return { template };
  });

  app.put('/api/admin/communications/templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const errors = validateTemplatePayload(body as never);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const existing = await prisma.communicationTemplate.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    const template = await prisma.communicationTemplate.update({
      where: { id },
      data: {
        name: String(body.name).trim(),
        subject: (body.subject as string) || null,
        body: normalizeBody(body.body as string) as string,
        bodyDesign: normalizeBodyDesign(body.bodyDesign) as object | undefined,
        channel: (body.channel as string) || 'email',
        category: body.category as string,
        updatedBy: request.appUser!.id
      }
    });
    return { template };
  });

  app.delete('/api/admin/communications/templates/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.communicationTemplate.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    await prisma.communicationTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: request.appUser!.id }
    });
    return { success: true };
  });

  app.post('/api/admin/communications/preview', { preHandler: adminOnly }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const errors = validateCommunicationPayload(body as never);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const recipients = normalizeRecipients(body.recipients as never);
    if (!recipients.length) {
      return reply.code(400).send({ error: 'At least one recipient is required' });
    }

    const summary = await evaluateEligibility(
      recipients,
      body.category as string,
      body.channel as string
    );
    return { summary };
  });

  const handleSend = async (
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
    draftId?: string
  ) => {
    const body = request.body as Record<string, unknown>;
    const errors = validateCommunicationPayload(body as never);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const recipients = normalizeRecipients(body.recipients as never);
    if (!recipients.length) {
      return reply.code(400).send({ error: 'At least one recipient is required' });
    }

    const preview = await evaluateEligibility(
      recipients,
      body.category as string,
      body.channel as string
    );
    if (preview.eligible === 0) {
      return reply.code(400).send({ error: 'No eligible recipients to send to', summary: preview });
    }

    const actorId = request.appUser!.id;
    let communication;

    if (draftId) {
      const existing = await prisma.communication.findFirst({
        where: { id: draftId, deletedAt: null }
      });
      if (!existing) return reply.code(404).send({ error: 'Communication not found' });
      if (existing.status !== COMMUNICATION_STATUS.DRAFT) {
        return reply.code(400).send({ error: 'Only draft communications can be sent' });
      }

      // Claim the draft atomically so a double-click cannot send twice.
      const claimed = await prisma.communication.updateMany({
        where: { id: draftId, status: COMMUNICATION_STATUS.DRAFT, deletedAt: null },
        data: {
          subject: (body.subject as string) ?? existing.subject,
          body: body.body != null ? (normalizeBody(body.body as string) as string) : existing.body,
          bodyDesign:
            body.bodyDesign !== undefined
              ? (normalizeBodyDesign(body.bodyDesign) as object | undefined)
              : (existing.bodyDesign as object | undefined),
          channel: (body.channel as string) ?? existing.channel,
          category: (body.category as string) ?? existing.category,
          recipientsJson: recipients as object[],
          status: COMMUNICATION_STATUS.SENDING,
          updatedBy: actorId
        }
      });
      if (claimed.count !== 1) {
        return reply.code(409).send({ error: 'This draft is already being sent' });
      }
      communication = await prisma.communication.findUniqueOrThrow({ where: { id: draftId } });
    } else {
      communication = await prisma.communication.create({
        data: {
          subject: (body.subject as string) || null,
          body: normalizeBody(body.body as string) as string,
          bodyDesign: normalizeBodyDesign(body.bodyDesign) as object | undefined,
          channel: body.channel as string,
          category: body.category as string,
          status: COMMUNICATION_STATUS.SENDING,
          recipientsJson: recipients as object[],
          createdBy: actorId,
          updatedBy: actorId
        }
      });
    }

    try {
      const result = await sendCommunication(communication, recipients, actorId);
      return result;
    } catch (error) {
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Failed to send communication'
          : error instanceof Error
            ? error.message
            : 'Failed to send communication';
      return reply.code(500).send({ error: message });
    }
  };

  app.post('/api/admin/communications/send', { preHandler: adminOnly }, async (request, reply) =>
    handleSend(request, reply)
  );

  app.post('/api/admin/communications/:id/send', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return handleSend(request, reply, id);
  });

  app.get('/api/admin/communications/sent', { preHandler: adminOnly }, async () => {
    const sent = await prisma.communication.findMany({
      where: {
        deletedAt: null,
        status: { in: [COMMUNICATION_STATUS.SENT, COMMUNICATION_STATUS.PARTIAL, COMMUNICATION_STATUS.FAILED] }
      },
      orderBy: { sentAt: 'desc' },
      take: 100
    });
    return { sent };
  });

  app.get('/api/admin/communications/sent/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const communication = await prisma.communication.findFirst({
      where: { id, deletedAt: null },
      include: { recipients: { orderBy: { createdAt: 'asc' } } }
    });
    if (!communication) return reply.code(404).send({ error: 'Communication not found' });
    return { communication };
  });

  app.post('/api/admin/communications/ai/generate', { preHandler: adminOnly }, async (request, reply) => {
    const body = request.body as {
      prompt?: string;
      existingSubject?: string;
      existingHtml?: string;
      category?: string;
    };
    try {
      const result = await generateOrRefineEmail({
        prompt: body.prompt || '',
        existingSubject: body.existingSubject,
        existingHtml: body.existingHtml,
        category: body.category
      });
      return result;
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'AI generation failed'
      });
    }
  });

  app.post('/api/admin/communications/assets', { preHandler: adminOnly }, async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: 'No file provided' });
      if (!ALLOWED_TYPES.has(file.mimetype)) {
        return reply.code(400).send({ error: 'Unsupported image type' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length > MAX_BYTES) {
        return reply.code(400).send({ error: 'Image is too large (max 10MB)' });
      }

      const url = await uploadCommunicationAsset(buffer, file.mimetype);
      return { url };
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to upload image'
      });
    }
  });

  // Unlayer embed can be loaded without auth (script tag); keep it open but under admin path.
  app.get('/api/admin/communications/unlayer-embed', async (_request, reply) => {
    try {
      const upstream = await fetch(UNLAYER_EMBED_URL, {
        headers: { Accept: 'application/javascript,*/*' }
      });
      if (!upstream.ok) {
        return reply.code(502).send({ error: `Upstream Unlayer embed failed (${upstream.status})` });
      }
      const source = await upstream.text();
      const patched =
        source.replace(/document\.currentScript\.src/g, JSON.stringify(UNLAYER_EMBED_URL)) +
        ';\nwindow.unlayer = unlayer;\n';
      return reply
        .header('Content-Type', 'application/javascript; charset=utf-8')
        .header('Cache-Control', 'public, max-age=3600')
        // Allow the Vite SPA (different origin in local/dev) to execute this script.
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(patched);
    } catch (error) {
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Failed to load Unlayer embed'
      });
    }
  });
};

/** Public asset proxy for email images (used by Unlayer preview and CID inliner). */
export const communicationAssetRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/communication-assets/*', async (request, reply) => {
    const wildcard = (request.params as { '*': string })['*'];
    if (!wildcard) return reply.code(404).send({ error: 'Not found' });
    try {
      const key = decodeURIComponent(wildcard);
      const { buffer, contentType } = await downloadCommunicationAsset(key);
      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(buffer);
    } catch {
      return reply.code(404).send({ error: 'Asset not found' });
    }
  });
};
