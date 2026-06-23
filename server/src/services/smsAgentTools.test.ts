import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmsToolDeclarations, executeSmsTool, type SmsToolContext } from './smsAgentTools.js';
import { MockAiProvider } from './aiService.js';

function makeCtx(overrides: Partial<SmsToolContext> = {}): SmsToolContext {
  return {
    userId: 'u1',
    phone: '+15551234567',
    dateKey: '2026-06-23',
    timeZone: 'America/New_York',
    message: 'hello',
    toolCalls: [],
    ...overrides
  };
}

describe('buildSmsToolDeclarations', () => {
  const tools = buildSmsToolDeclarations();
  const names = tools.map((t) => t.name);

  it('exposes the full action catalog plus clarification', () => {
    for (const expected of [
      'get_macro_status',
      'log_food',
      'analyze_meal_photo',
      'log_photo_estimate',
      'move_food_to_meal',
      'mark_meal_complete',
      'mark_exercise_done',
      'mark_all_exercises_done',
      'log_water',
      'suggest_meals',
      'request_clarification'
    ]) {
      assert.ok(names.includes(expected), `missing tool: ${expected}`);
    }
  });

  it('declares required params on the writes that need them', () => {
    const logFood = tools.find((t) => t.name === 'log_food');
    assert.deepEqual(logFood?.parameters?.required, ['foodText']);
    const water = tools.find((t) => t.name === 'log_water');
    assert.deepEqual(water?.parameters?.required, ['amountOz']);
  });
});

describe('executeSmsTool (no-DB branches)', () => {
  it('returns an error for an unknown tool', async () => {
    const ctx = makeCtx();
    const out = await executeSmsTool(ctx, 'nope', {});
    assert.match(String(out.error), /Unknown tool/);
  });

  it('captures a clarification as a pending action instead of acting', async () => {
    const ctx = makeCtx();
    const out = await executeSmsTool(ctx, 'request_clarification', {
      tool: 'log_food',
      partialArgs: { foodText: 'chicken' },
      question: 'Which meal?'
    });
    assert.equal(out.result, 'Which meal?');
    assert.equal(ctx.pendingAction?.tool, 'log_food');
    assert.deepEqual(ctx.pendingAction?.args, { foodText: 'chicken' });
  });

  it('errors when a photo tool runs with no attached image', async () => {
    const ctx = makeCtx({ imageError: 'download failed' });
    const out = await executeSmsTool(ctx, 'analyze_meal_photo', { log: true });
    assert.equal(out.error, 'download failed');
  });

  it('errors on log_food with no food text before hitting the DB', async () => {
    const ctx = makeCtx();
    const out = await executeSmsTool(ctx, 'log_food', { foodText: '   ' });
    assert.match(String(out.error), /food and amount/i);
  });

  it('records every call for audit', async () => {
    const ctx = makeCtx();
    await executeSmsTool(ctx, 'request_clarification', { tool: 'log_water', question: 'how much?' });
    assert.equal(ctx.toolCalls.length, 1);
    assert.equal(ctx.toolCalls[0]?.name, 'request_clarification');
  });

  it('does not run write tools after abort', async () => {
    const ctx = makeCtx();
    const controller = new AbortController();
    controller.abort();
    const out = await executeSmsTool(ctx, 'log_food', { foodText: 'chicken' }, controller.signal);
    assert.equal(out.error, 'Request cancelled.');
    assert.equal(ctx.toolCalls.length, 0);
  });
});

describe('MockAiProvider.runAgent routing', () => {
  async function route(content: string) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const reply = await new MockAiProvider().runAgent({
      messages: [{ role: 'user', content }],
      context: '{}',
      tools: [],
      toolExecutor: async (name, args) => {
        calls.push({ name, args });
        return { result: 'ok' };
      }
    });
    return { calls, reply };
  }

  it('routes a food report to log_food', async () => {
    const { calls } = await route('had 6 oz chicken and rice for lunch');
    assert.equal(calls[0]?.name, 'log_food');
    assert.equal(calls[0]?.args.mealName, 'lunch');
  });

  it('routes water to log_water', async () => {
    const { calls } = await route('16 oz water');
    assert.equal(calls[0]?.name, 'log_water');
    assert.equal(calls[0]?.args.amountOz, 16);
  });

  it('routes a macro question to get_macro_status', async () => {
    const { calls } = await route('how many calories do I have left');
    assert.equal(calls[0]?.name, 'get_macro_status');
  });

  it('analyzes an attached photo, logging only when asked', async () => {
    const logged = await route('log this\n\n[The user attached a meal photo with this message.]');
    assert.equal(logged.calls[0]?.name, 'analyze_meal_photo');
    assert.equal(logged.calls[0]?.args.log, true);

    const bare = await route('[The user attached a meal photo with this message.]');
    assert.equal(bare.calls[0]?.name, 'analyze_meal_photo');
    assert.equal(bare.calls[0]?.args.log, false);
  });
});
