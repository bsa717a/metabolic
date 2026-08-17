import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { listPushDevices, registerPushDevice, unregisterPushDevice } from '../services/pushNotificationService.js';

const tokenBody = z.object({
  token: z.string().trim().min(10).max(4096),
  userAgent: z.string().max(400).optional()
});

export async function pushRoutes(app: FastifyInstance) {
  app.get('/api/push/devices', { preHandler: requireAuth }, async (request) => {
    const devices = await listPushDevices(request.appUser!.id);
    return { devices, enabled: devices.length > 0 };
  });

  app.post('/api/push/devices', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = tokenBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A valid notification token is required.' });
    }
    const device = await registerPushDevice(
      request.appUser!.id,
      parsed.data.token,
      parsed.data.userAgent ?? request.headers['user-agent'] ?? null
    );
    return { device: { id: device.id, lastSeenAt: device.lastSeenAt.toISOString() } };
  });

  app.delete('/api/push/devices', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = tokenBody.pick({ token: true }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'A valid notification token is required.' });
    }
    await unregisterPushDevice(request.appUser!.id, parsed.data.token);
    return { ok: true };
  });
}
