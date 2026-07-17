import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { VIRTUAL_COACH_IDS } from '../data/virtualCoachPersonas.js';
import { getSetupDraft, setupFirstProgram, userNeedsSetup } from '../services/onboardingService.js';

const setupBody = z.object({
  programName: z.string().trim().min(1).max(120).optional(),
  weight: z.number().finite().positive().max(1000),
  goalWeight: z.number().finite().positive().max(1000),
  bodyFat: z.number().finite().min(1).max(75).optional(),
  goalBodyFat: z.number().finite().min(1).max(75).optional(),
  calorieTarget: z.number().finite().positive().max(10000).optional(),
  proteinTarget: z.number().finite().positive().max(1000).optional(),
  coachCode: z.string().trim().max(20).optional(),
  wantsCoach: z.boolean().optional(),
  selectedVirtualCoachId: z.enum(VIRTUAL_COACH_IDS).optional(),
  trackingOnly: z.boolean().optional(),
  heightFeet: z.number().int().min(0).max(8).optional(),
  heightInches: z.number().int().min(0).max(11).optional(),
  occupation: z.string().trim().max(200).optional(),
  activityLevel: z.number().int().min(1).max(5).optional(),
  gender: z.enum(['m', 'f', 'male', 'female']).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().trim().min(1).max(100).optional()
});

export async function onboardingRoutes(app: FastifyInstance) {
  app.get('/api/onboarding/status', { preHandler: requireAuth }, async (request) => {
    const needsSetup = await userNeedsSetup(request.appUser!.id);
    return { needsSetup };
  });

  app.get('/api/onboarding/setup-draft', { preHandler: requireAuth }, async (request) => {
    return getSetupDraft(request.appUser!.id);
  });

  app.post('/api/onboarding/setup', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = setupBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Enter a valid current weight and goal weight to continue.' });
    }

    try {
      const program = await setupFirstProgram(request.appUser!.id, parsed.data);
      return {
        program: {
          id: program.id,
          name: program.name,
          status: program.status,
          startDate: program.startDate.toISOString(),
          targetEndDate: program.targetEndDate?.toISOString() ?? null,
          metrics: program.metrics.map((metric) => ({
            id: metric.id,
            metricType: metric.metricType,
            startValue: Number(metric.startValue),
            currentValue: Number(metric.currentValue),
            goalValue: Number(metric.goalValue),
            unit: metric.unit
          }))
        }
      };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to complete first-time setup');
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Unable to complete setup' });
    }
  });
}
