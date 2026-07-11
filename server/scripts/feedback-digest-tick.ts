/**
 * Run the beta feedback digest + diagnostics-retention purge locally.
 *
 *   cd server && npx tsx --env-file=.env scripts/feedback-digest-tick.ts
 *
 * In production this is driven by POST /api/internal/feedback/digest (x-cron-secret).
 */
import { prisma } from '../src/db/prisma.js';
import { runFeedbackDigestTick } from '../src/services/feedbackNotificationService.js';

async function main() {
  const result = await runFeedbackDigestTick();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
