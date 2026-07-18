/**
 * Tool catalog for the web coach chat agent. Reuses the channel-agnostic SMS tools
 * (macros, food logging, completions, water, suggestions) and adds planned-meal editing.
 * Phone-keyed SMS tools (photo estimates, move-last-food) are intentionally excluded.
 */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { buildSmsToolDeclarations, executeSmsTool, type SmsToolContext } from './smsAgentTools.js';
import { applyPlannedMealUpdate, PlanEditError } from './planEditService.js';
import { updateUserSmsSetup } from './smsSetupService.js';

export type MealEditFocus = {
  mealName: string;
  mealId?: string;
  date: string;
  targetCalories?: number;
};

export type WebCoachToolContext = {
  userId: string;
  dateKey: string;
  timeZone: string | null;
  /** The user's current chat message. */
  message: string;
  /** Audit log of tool calls made this turn. */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** When set, the user is editing one planned meal — block logging tools. */
  mealEditFocus?: MealEditFocus;
};

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

/** Tools allowed while the client has an active meal-edit session. */
const MEAL_EDIT_TOOLS = new Set(['update_planned_meals', 'suggest_meals', 'get_macro_status']);

export function buildWebCoachToolDeclarations(options?: { mealEditFocus?: MealEditFocus }): FunctionDeclaration[] {
  const shared = buildSmsToolDeclarations().filter((tool) => SHARED_SMS_TOOLS.has(tool.name));
  const all = [
    ...shared,
    {
      name: 'update_planned_meals',
      description:
        'Replace the PLANNED items of one or more meals on a specific day (today or up to 31 days ahead). Meals are matched to the day\'s existing meals by name; a name that does not exist creates a new meal. Food the user already logged as eaten is never touched. Use when the user asks to set up, change, or swap planned meals — e.g. "swap out tomorrow\'s meals with this list". Resolve relative dates like "tomorrow" from context.today.date. If the user already has meals planned that day and did NOT give you an explicit replacement list, confirm once before calling this. Estimate realistic per-item macros; honor any totals the user stated.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          date: { type: SchemaType.STRING, description: 'Target day, YYYY-MM-DD. Today or future only.' },
          meals: {
            type: SchemaType.ARRAY,
            description: 'Meals to set. Only the meals listed here are changed; other meals on the day stay as they are.',
            items: {
              type: SchemaType.OBJECT,
              properties: {
                mealName: {
                  type: SchemaType.STRING,
                  description: 'Meal to target, e.g. "Breakfast", "Lunch", "Dinner", "Snack". Matches the day\'s existing meal by name, otherwise creates a new meal.'
                },
                plannedTime: { type: SchemaType.STRING, description: 'Optional 24h time, e.g. "13:00".' },
                items: {
                  type: SchemaType.ARRAY,
                  description: 'The planned foods for this meal, replacing whatever was planned before.',
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      name: { type: SchemaType.STRING, description: 'Food name, e.g. "Banana" or "2 eggs scrambled".' },
                      quantity: { type: SchemaType.NUMBER, description: 'Amount, default 1.' },
                      unit: { type: SchemaType.STRING, description: 'Unit, e.g. "serving", "cup", "oz". Default "serving".' },
                      calories: { type: SchemaType.NUMBER, description: 'Calories for this quantity.' },
                      protein: { type: SchemaType.NUMBER, description: 'Protein grams for this quantity.' },
                      carbs: { type: SchemaType.NUMBER, description: 'Carb grams for this quantity.' },
                      fat: { type: SchemaType.NUMBER, description: 'Fat grams for this quantity.' }
                    },
                    required: ['name', 'calories', 'protein', 'carbs', 'fat']
                  }
                }
              },
              required: ['mealName', 'items']
            }
          }
        },
        required: ['date', 'meals']
      }
    },
    {
      name: 'update_sms_setup',
      description:
        'Save the user\'s personal mobile phone and/or SMS reminder settings for text coaching. Use when they give you their cell number or ask you to turn on meal/evening text reminders. Phone must be their personal cell — never the coach texting number from smsSupport.virtualCoachSmsNumber. When saving a new phone, meal and evening reminders are turned on automatically unless they say otherwise.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          phone: {
            type: SchemaType.STRING,
            description: 'Personal mobile phone number, e.g. "510-375-9360" or "+1 510 375 9360".'
          },
          timezone: {
            type: SchemaType.STRING,
            description: 'IANA timezone, e.g. "America/Denver". Only set when the user provides it.'
          },
          enableReminders: {
            type: SchemaType.BOOLEAN,
            description: 'When true, turn on meal reminders and evening recap texts.'
          },
          smsMealRemindersEnabled: { type: SchemaType.BOOLEAN },
          smsEveningRecapEnabled: { type: SchemaType.BOOLEAN }
        }
      }
    }
  ];

  if (!options?.mealEditFocus) return all as FunctionDeclaration[];
  return all.filter((tool) => MEAL_EDIT_TOOLS.has(tool.name)) as FunctionDeclaration[];
}

/** Runs a tool the web coach agent called and returns a JSON-serializable result/error. */
export async function executeWebCoachTool(
  ctx: WebCoachToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (ctx.mealEditFocus && !MEAL_EDIT_TOOLS.has(name) && name !== 'update_sms_setup') {
    return {
      error: `While editing ${ctx.mealEditFocus.mealName}, only planned-meal changes are allowed — not logging food or other day actions.`
    };
  }

  if (name === 'update_planned_meals') {
    try {
      let focusedArgs = args;
      if (ctx.mealEditFocus) {
        const focusName = ctx.mealEditFocus.mealName.trim().toLowerCase();
        const rawMeals = Array.isArray(args.meals) ? args.meals : [];
        const matchedMeal =
          rawMeals.find((meal) => {
            if (!meal || typeof meal !== 'object') return false;
            const mealName = (meal as Record<string, unknown>).mealName;
            return typeof mealName === 'string' && mealName.trim().toLowerCase() === focusName;
          }) ?? rawMeals.find((meal) => meal && typeof meal === 'object') ??
          null;
        const entry =
          matchedMeal && typeof matchedMeal === 'object' ? (matchedMeal as Record<string, unknown>) : null;
        focusedArgs = {
          date: ctx.mealEditFocus.date,
          meals: [
            {
              mealName: ctx.mealEditFocus.mealName,
              ...(typeof entry?.plannedTime === 'string' ? { plannedTime: entry.plannedTime } : {}),
              items: Array.isArray(entry?.items) ? entry.items : []
            }
          ]
        };
      }
      const result = await applyPlannedMealUpdate(ctx.userId, ctx.timeZone, focusedArgs);
      ctx.toolCalls.push({ name, args: focusedArgs });
      return { result };
    } catch (error) {
      if (error instanceof PlanEditError) return { error: error.message };
      return { error: error instanceof Error ? error.message : 'Could not update the planned meals.' };
    }
  }

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
