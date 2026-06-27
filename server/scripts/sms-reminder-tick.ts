/**
 * Run proactive SMS reminder tick locally (pre-meal nudges + evening recap).
 *
 *   cd server && npx tsx --env-file=.env scripts/sms-reminder-tick.ts
 */
import { runSmsReminderTick } from '../src/services/smsReminderService.js';

const result = await runSmsReminderTick();
console.log(JSON.stringify(result, null, 2));
