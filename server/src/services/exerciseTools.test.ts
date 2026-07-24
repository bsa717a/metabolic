import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExerciseToolDeclarations,
  EXERCISE_MANAGEMENT_TOOLS,
  EXERCISE_MUTATION_TOOLS
} from './exerciseTools.js';
import { buildSmsToolDeclarations } from './smsAgentTools.js';
import { buildWebCoachToolDeclarations } from './webCoachTools.js';

function names(tools: { name?: string }[]): string[] {
  return tools.map((tool) => tool.name ?? '');
}

describe('exercise tool catalog', () => {
  it('exposes the full day-level set', () => {
    const declared = new Set(names(buildExerciseToolDeclarations()));
    for (const tool of EXERCISE_MANAGEMENT_TOOLS) {
      assert.ok(declared.has(tool), `missing declaration for ${tool}`);
    }
  });

  it('marks mutators separately from read/suggest tools', () => {
    assert.ok(EXERCISE_MUTATION_TOOLS.has('add_exercise'));
    assert.ok(EXERCISE_MUTATION_TOOLS.has('skip_exercise'));
    assert.ok(!EXERCISE_MUTATION_TOOLS.has('get_exercise_details'));
    assert.ok(!EXERCISE_MUTATION_TOOLS.has('suggest_exercises'));
  });

  it('gives both channels the shared exercise tools', () => {
    const sms = new Set(names(buildSmsToolDeclarations()));
    const web = new Set(names(buildWebCoachToolDeclarations()));
    for (const tool of EXERCISE_MANAGEMENT_TOOLS) {
      assert.ok(sms.has(tool), `SMS missing ${tool}`);
      assert.ok(web.has(tool), `web missing ${tool}`);
    }
  });

  it('exposes get_exercise_details and suggest_exercises on web', () => {
    const web = new Set(names(buildWebCoachToolDeclarations()));
    assert.ok(web.has('get_exercise_details'));
    assert.ok(web.has('suggest_exercises'));
  });

  it('blocks exercise tools during a meal-edit session on web', () => {
    const editing = new Set(
      names(buildWebCoachToolDeclarations({ mealEditFocus: { mealName: 'Lunch', date: '2026-07-22' } }))
    );
    assert.ok(!editing.has('add_exercise'));
    assert.ok(!editing.has('suggest_exercises'));
    assert.ok(!editing.has('get_exercise_details'));
    assert.ok(editing.has('add_meal_item'));
  });

  it('has no duplicate names on either catalog', () => {
    for (const [label, list] of [
      ['SMS', names(buildSmsToolDeclarations())],
      ['web', names(buildWebCoachToolDeclarations())]
    ] as const) {
      assert.equal(new Set(list).size, list.length, `${label} duplicates: ${list}`);
    }
  });

  it('requires a name on add_exercise', () => {
    const add = buildExerciseToolDeclarations().find((tool) => tool.name === 'add_exercise');
    assert.deepEqual(add?.parameters?.required, ['name']);
  });
});
