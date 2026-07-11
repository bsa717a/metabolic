/**
 * Tool catalog for the web coach chat agent. Reuses the channel-agnostic SMS tools
 * (macros, food logging, completions, water, suggestions) and adds planned-meal editing.
 * Phone-keyed SMS tools (photo estimates, move-last-food) are intentionally excluded.
 */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { buildSmsToolDeclarations, executeSmsTool, type SmsToolContext } from './smsAgentTools.js';
import { applyPlannedMealUpdate, PlanEditError } from './planEditService.js';

export type WebCoachToolContext = {
  userId: string;
  dateKey: string;
  timeZone: string | null;
  /** The user's current chat message. */
  message: string;
  /** Audit log of tool calls made this turn. */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
};

const SHARED_SMS_TOOLS = new Set([
  'get_macro_status',
  'log_food',
  'mark_meal_complete',
  'mark_exercise_done',
  'mark_all_exercises_done',
  'log_water',
  'suggest_meals'
]);

export function buildWebCoachToolDeclarations(): FunctionDeclaration[] {
  const shared = buildSmsToolDeclarations().filter((tool) => SHARED_SMS_TOOLS.has(tool.name));
  return [
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
    }
  ];
}

/** Runs a tool the web coach agent called and returns a JSON-serializable result/error. */
export async function executeWebCoachTool(
  ctx: WebCoachToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (name === 'update_planned_meals') {
    ctx.toolCalls.push({ name, args });
    try {
      const result = await applyPlannedMealUpdate(ctx.userId, ctx.timeZone, args);
      return { result };
    } catch (error) {
      if (error instanceof PlanEditError) return { error: error.message };
      return { error: error instanceof Error ? error.message : 'Could not update the planned meals.' };
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
