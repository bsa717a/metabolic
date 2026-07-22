import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMealToolDeclarations, MEAL_MANAGEMENT_TOOLS } from './mealTools.js';
import { buildSmsToolDeclarations } from './smsAgentTools.js';
import { buildWebCoachToolDeclarations } from './webCoachTools.js';

function names(tools: { name?: string }[]): string[] {
  return tools.map((tool) => tool.name ?? '');
}

describe('meal tool catalog', () => {
  it('exposes the full CRUD set', () => {
    const declared = new Set(names(buildMealToolDeclarations()));
    for (const tool of MEAL_MANAGEMENT_TOOLS) {
      assert.ok(declared.has(tool), `missing declaration for ${tool}`);
    }
  });

  it('has no duplicate names on the SMS catalog', () => {
    const list = names(buildSmsToolDeclarations());
    assert.equal(new Set(list).size, list.length, `duplicates: ${list}`);
  });

  it('has no duplicate names on the web catalog', () => {
    const list = names(buildWebCoachToolDeclarations());
    assert.equal(new Set(list).size, list.length, `duplicates: ${list}`);
  });

  it('gives both channels the shared meal-management tools', () => {
    const sms = new Set(names(buildSmsToolDeclarations()));
    const web = new Set(names(buildWebCoachToolDeclarations()));
    for (const tool of MEAL_MANAGEMENT_TOOLS) {
      assert.ok(sms.has(tool), `SMS missing ${tool}`);
      assert.ok(web.has(tool), `web missing ${tool}`);
    }
  });

  it('restricts the web catalog to edit tools during a meal-edit session', () => {
    const editing = new Set(names(buildWebCoachToolDeclarations({ mealEditFocus: { mealName: 'Lunch', date: '2026-07-22' } })));
    assert.ok(editing.has('add_meal_item'));
    assert.ok(editing.has('rename_meal'));
    assert.ok(!editing.has('log_food'), 'logging should be blocked while editing a meal');
    assert.ok(!editing.has('create_meal'), 'creating a new meal is out of scope of a single meal edit');
  });

  // Rename and time-change were previously conflated ("I said change the time but it renamed the
  // meal"). Keep them as three distinct tools, each shaped so the model can't confuse the intent.
  it('keeps rename, retime, and full-swap as distinct, correctly-shaped tools', () => {
    const byName = new Map(buildMealToolDeclarations().map((tool) => [tool.name ?? '', tool]));
    const rename = byName.get('rename_meal');
    const retime = byName.get('update_meal_time');
    const swap = byName.get('update_planned_meals');
    assert.ok(rename && retime && swap, 'rename_meal, update_meal_time, update_planned_meals must all exist');
    assert.deepEqual(rename?.parameters?.required, ['newName'], 'rename_meal must require newName only');
    assert.deepEqual(retime?.parameters?.required, ['plannedTime'], 'update_meal_time must require plannedTime only');
    assert.ok(
      !(rename?.parameters?.properties && 'plannedTime' in rename.parameters.properties),
      'rename_meal must not accept plannedTime'
    );
    assert.ok(
      !(retime?.parameters?.properties && 'newName' in retime.parameters.properties),
      'update_meal_time must not accept newName'
    );
    assert.ok(
      swap?.parameters?.required?.includes('meals'),
      'update_planned_meals is the only full-swap tool and requires a meals list'
    );
  });
});
