import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { env } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { dashboardRoutes } from './routes/dashboardRoutes.js';
import { programRoutes } from './routes/programRoutes.js';
import { nutritionRoutes } from './routes/nutritionRoutes.js';
import { exerciseRoutes } from './routes/exerciseRoutes.js';
import { foodRoutes } from './routes/foodRoutes.js';
import { aiRoutes } from './routes/aiRoutes.js';
import { smsRoutes } from './routes/smsRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { mealCardAdminRoutes } from './routes/mealCardAdminRoutes.js';
import { targetAdminRoutes } from './routes/targetAdminRoutes.js';
import { onboardingRoutes } from './routes/onboardingRoutes.js';
import { gamificationRoutes } from './routes/gamificationRoutes.js';
import { coachRoutes } from './routes/coachRoutes.js';
import { bloodPanelRoutes } from './routes/bloodPanelRoutes.js';
import { hydrationRoutes } from './routes/hydrationRoutes.js';
import { internalRoutes } from './routes/internalRoutes.js';
import { tutorialRoutes } from './routes/tutorialRoutes.js';
import { virtualCoachRoutes } from './routes/virtualCoachRoutes.js';
import { billingRoutes } from './routes/billingRoutes.js';

async function main() {
  const app = Fastify({ logger: true, bodyLimit: 16 * 1024 * 1024 });

  await app.register(cors, {
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
  await app.register(helmet);
  await app.register(formbody);
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024
    }
  });

  app.get('/health', async () => ({ ok: true, service: 'metabolic-api' }));
  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(programRoutes);
  await app.register(nutritionRoutes);
  await app.register(exerciseRoutes);
  await app.register(foodRoutes);
  await app.register(aiRoutes);
  await app.register(smsRoutes);
  await app.register(adminRoutes);
  await app.register(mealCardAdminRoutes);
  await app.register(targetAdminRoutes);
  await app.register(coachRoutes);
  await app.register(bloodPanelRoutes);
  await app.register(onboardingRoutes);
  await app.register(gamificationRoutes);
  await app.register(hydrationRoutes);
  await app.register(tutorialRoutes);
  await app.register(virtualCoachRoutes);
  await app.register(billingRoutes);
  await app.register(internalRoutes);

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({ error: error.message ?? 'Internal server error' });
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
