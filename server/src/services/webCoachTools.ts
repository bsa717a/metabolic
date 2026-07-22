/**
 * Tool catalog for the web coach chat agent. Composes the shared meal-management tools (build,
 * maintain, and edit meals) with the channel-agnostic SMS read/log tools (macros, food logging,
 * completions, water, suggestions) plus web-only SMS setup. Phone-keyed SMS tools (photo estimates,
 * move-last-food) are intentionally excluded.
 */
import { Type, type FunctionDeclaration } from '@google/genai';
import { buildSmsToolDeclarations, executeSmsTool, type SmsToolContext } from './smsAgentTools.js';
import {
  buildMealToolDeclarations,
  executeMealTool,
  MEAL_EDIT_TOOLS,
  MEAL_MANAGEMENT_TOOLS,
  type ActiveMealContext,
  type MealEditFocus,
  type MealToolContext
} from './mealTools.js';
import { updateUserSmsSetup } from './smsSetupService.js';

export type { ActiveMealContext, MealEditFocus } from './mealTools.js';
export type WebCoachToolContext = MealToolContext;

/** SMS read/log tools the web coach reuses (everything meal-plan-editing comes from mealTools). */
const SHARED_SMS_TOOLS = new Set([
  'get_macro_status',
  'get_hydration_status',
  'log_food',
  'mark_meal_complete',
  'mark_exercise_done',
  'mark_all_exercises_done',
  'log_water',
  'set_hydration_goal',
  'suggest_meals'
]);

/** Tools allowed while the client has an active meal-edit session. Computed at call time to avoid
 *  a module-load circular reference into mealTools. */
function isMealEditSessionTool(name: string): boolean {
  return MEAL_EDIT_TOOLS.has(name) || name === 'suggest_meals' || name === 'get_macro_status';
}

export function buildWebCoachToolDeclarations(options?: { mealEditFocus?: MealEditFocus }): FunctionDeclaration[] {
  const shared = buildSmsToolDeclarations().filter((tool) => SHARED_SMS_TOOLS.has(tool.name ?? ''));
  const all: FunctionDeclaration[] = [
    ...shared,
    ...buildMealToolDeclarations(),
    {
      name: 'update_sms_setup',
      description:
        'Save the user\'s personal mobile phone and/or SMS reminder settings for text coaching. Use when they give you their cell number or ask you to turn on meal/evening text reminders. Phone must be their personal cell — never the coach texting number from smsSupport.virtualCoachSmsNumber. When saving a new phone, meal and evening reminders are turned on automatically unless they say otherwise.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          phone: { type: Type.STRING, description: 'Personal mobile phone number, e.g. "510-375-9360" or "+1 510 375 9360".' },
          timezone: { type: Type.STRING, description: 'IANA timezone, e.g. "America/Denver". Only set when the user provides it.' },
          enableReminders: { type: Type.BOOLEAN, description: 'When true, turn on meal reminders and evening recap texts.' },
          smsMealRemindersEnabled: { type: Type.BOOLEAN },
          smsEveningRecapEnabled: { type: Type.BOOLEAN }
        }
      }
    }
  ];

  if (!options?.mealEditFocus) return all;
  return all.filter((tool) => isMealEditSessionTool(tool.name ?? ''));
}

/** Runs a tool the web coach agent called and returns a JSON-serializable result/error. */
export async function executeWebCoachTool(
  ctx: WebCoachToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (ctx.mealEditFocus && !isMealEditSessionTool(name) && name !== 'update_sms_setup') {
    return {
      error: `While editing ${ctx.mealEditFocus.mealName}, only planned-meal changes are allowed — not logging food or other day actions.`
    };
  }

  const mealResult = await executeMealTool(ctx, name, args);
  if (mealResult) return mealResult;

  if (name === 'update_sms_setup') {
    ctx.toolCalls.push({ name, args });
    try {
      const phone = typeof args.phone === 'string' ? args.phone : undefined;
      const timezone = typeof args.timezone === 'string' ? args.timezone : undefined;
      const enableReminders = args.enableReminders === true;
      const smsMealRemindersEnabled =
        typeof args.smsMealRemindersEnabled === 'boolean' ? args.smsMealRemindersEnabled : undefined;
      const smsEveningRecapEnabled =
        typeof args.smsEveningRecapEnabled === 'boolean' ? args.smsEveningRecapEnabled : undefined;
      const { result } = await updateUserSmsSetup(ctx.userId, {
        phone,
        timezone,
        enableReminders,
        smsMealRemindersEnabled,
        smsEveningRecapEnabled
      });
      return { result };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not update SMS setup.' };
    }
  }

  if (!SHARED_SMS_TOOLS.has(name)) return { error: `Unknown tool: ${name}` };

  const smsCtx: SmsToolContext = {
    userId: ctx.userId,
    phone: '',
    dateKey: ctx.dateKey,
    timeZone: ctx.timeZone,
    message: ctx.message,
    toolCalls: ctx.toolCalls
  };
  return executeSmsTool(smsCtx, name, args);
}

export { MEAL_MANAGEMENT_TOOLS };
