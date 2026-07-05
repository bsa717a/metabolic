import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireFeature } from '../auth/requireFeature.js';
import { activateProgram, getProgram, listPrograms, listProgramMetricSnapshots, listProgressPhotoSets, saveProgramMetricSnapshot, updateProgramMetricSnapshot, updateProgramMetrics, upsertProgressPhotoSet, upsertSnapshotMeasurement } from '../services/programService.js';
import { getActiveProgressSummaryForUser, getProgressSummary } from '../services/progressSummaryService.js';
import { prisma } from '../db/prisma.js';

const programBody = z.object({ name: z.string().min(1), startDate: z.string(), targetEndDate: z.string().optional().nullable() });
const metricUpdateBody = z.array(
  z.object({
    id: z.string(),
    startValue: z.number().finite(),
    currentValue: z.number().finite(),
    goalValue: z.number().finite()
  })
);
const snapshotBody = z.array(
  z.object({
    metricType: z.string().min(1),
    currentValue: z.number().finite(),
    unit: z.string().min(1)
  })
);

const measurementBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metricType: z.enum(['WEIGHT', 'WAIST', 'HIPS', 'CHEST']),
  currentValue: z.number().finite().positive(),
  unit: z.string().min(1).max(12)
});

const progressPhotoBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frontUrl: z.string().optional().nullable(),
  sideUrl: z.string().optional().nullable(),
  backUrl: z.string().optional().nullable(),
  id: z.string().optional()
});

function normalizePhotoUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new Error('Photo links must be valid URLs.');
  }
}

function serializeSnapshot(snapshot: {
  id: string;
  date: Date;
  values: Array<{ metricType: string; currentValue: unknown; unit: string }>;
  coachSession?: { notes: string } | null;
}) {
  return {
    id: snapshot.id,
    date: snapshot.date.toISOString().slice(0, 10),
    values: snapshot.values.map((value) => ({
      metricType: value.metricType,
      currentValue: Number(value.currentValue),
      unit: value.unit
    })),
    sessionNotes: snapshot.coachSession?.notes?.trim() ? snapshot.coachSession.notes : null
  };
}

export async function programRoutes(app: FastifyInstance) {
  app.get('/api/programs', { preHandler: requireAuth }, async (request) => listPrograms(request.appUser!));

  app.patch('/api/programs/:id/metrics', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = metricUpdateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid metric values. Use valid numbers for start, current, and goal.' });
    }
    try {
      return await updateProgramMetrics(request.appUser!, id, parsed.data);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update program metrics');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update metrics' });
    }
  });

  app.get('/api/programs/:id/metric-snapshots', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const snapshots = await listProgramMetricSnapshots(request.appUser!, id);
      return snapshots.map(serializeSnapshot);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list metric snapshots');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to list session snapshots' });
    }
  });

  app.post('/api/programs/:id/metric-snapshots', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = snapshotBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid session snapshot values. Use valid numbers for each metric.' });
    }
    try {
      const snapshot = await saveProgramMetricSnapshot(request.appUser!, id, parsed.data);
      return serializeSnapshot(snapshot);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save metric snapshot');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save session snapshot' });
    }
  });

  app.patch('/api/programs/:id/metric-snapshots/:snapshotId', { preHandler: requireAuth }, async (request, reply) => {
    const { id, snapshotId } = request.params as { id: string; snapshotId: string };
    const parsed = snapshotBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid session snapshot values. Use valid numbers for each metric.' });
    }
    try {
      const snapshot = await updateProgramMetricSnapshot(request.appUser!, id, snapshotId, parsed.data);
      return serializeSnapshot(snapshot);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update metric snapshot');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to update session snapshot' });
    }
  });

  app.post('/api/programs/:id/metric-snapshots/measurements', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = measurementBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid date and measurement value.' });
    }
    try {
      const snapshot = await upsertSnapshotMeasurement(request.appUser!, id, parsed.data);
      return serializeSnapshot(snapshot);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save tracking measurement');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save measurement' });
    }
  });

  app.get('/api/programs/:id/progress-photos', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await listProgressPhotoSets(request.appUser!, id);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list progress photos');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to list progress photos' });
    }
  });

  app.post('/api/programs/:id/progress-photos', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = progressPhotoBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid date and photo URLs.' });
    }
    try {
      return await upsertProgressPhotoSet(request.appUser!, id, {
        id: parsed.data.id,
        date: parsed.data.date,
        frontUrl: normalizePhotoUrl(parsed.data.frontUrl),
        sideUrl: normalizePhotoUrl(parsed.data.sideUrl),
        backUrl: normalizePhotoUrl(parsed.data.backUrl)
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to save progress photos');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to save progress photos' });
    }
  });

  app.get('/api/programs/:id/progress-summary', { preHandler: [requireAuth, requireFeature('advanced_progress_reports')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getProgressSummary(request.appUser!, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load progress summary';
      const status = message === 'Forbidden' ? 403 : message === 'Program not found' ? 404 : 400;
      return reply.code(status).send({ error: message });
    }
  });

  app.get('/api/progress/summary', { preHandler: [requireAuth, requireFeature('advanced_progress_reports')] }, async (request, reply) => {
    const query = request.query as { userId?: string };
    try {
      return await getActiveProgressSummaryForUser(request.appUser!, query.userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load progress summary';
      const status =
        message === 'Forbidden' ? 403 : message === 'No active program found' ? 404 : 400;
      return reply.code(status).send({ error: message });
    }
  });

  app.get('/api/programs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const program = await getProgram(request.appUser!, id);
    return program ?? reply.code(404).send({ error: 'Program not found' });
  });

  app.post('/api/programs', { preHandler: requireAuth }, async (request) => {
    const body = programBody.parse(request.body);
    return prisma.program.create({ data: { ...body, startDate: new Date(body.startDate), targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : null, userId: request.appUser!.id } });
  });

  app.patch('/api/programs/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const body = programBody.partial().parse(request.body);
    return prisma.program.update({ where: { id }, data: { ...body, startDate: body.startDate ? new Date(body.startDate) : undefined, targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : undefined } });
  });

  app.post('/api/programs/:id/activate', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return activateProgram(request.appUser!.id, id);
  });
}
