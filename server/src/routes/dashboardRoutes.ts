import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/requireAuth.js';
import { getTodayDashboard } from '../services/dashboardService.js';
import { parseClientDayQuery, resolveRequestTimeZone } from '../utils/dates.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard/today', { preHandler: requireAuth }, async (request) => {
    const { dateKey, timeZone: clientTimeZone } = parseClientDayQuery(request.query);
    const timeZone = resolveRequestTimeZone(clientTimeZone, request.appUser!.timezone);
    return getTodayDashboard(request.appUser!.id, dateKey, timeZone);
  });
}
