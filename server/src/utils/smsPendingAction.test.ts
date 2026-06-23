import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_ACTION_TTL_MS,
  isPendingActionFresh,
  parsePendingAction,
  parseStoredPhotoEstimate,
  serializePendingAction,
  serializePhotoEstimateIntent
} from './smsFoodParse.js';

describe('pending action stash', () => {
  it('round-trips a pending action through the intent column', () => {
    const now = 1_000_000;
    const serialized = serializePendingAction({
      tool: 'log_food',
      args: { foodText: 'chicken and rice' },
      question: 'Which meal — lunch or dinner?',
      createdAt: now
    });
    const parsed = parsePendingAction(serialized);
    assert.ok(parsed);
    assert.equal(parsed.tool, 'log_food');
    assert.deepEqual(parsed.args, { foodText: 'chicken and rice' });
    assert.equal(parsed.createdAt, now);
  });

  it('ignores non-pending intents', () => {
    assert.equal(parsePendingAction('PHOTO_ESTIMATE:{}'), null);
    assert.equal(parsePendingAction(null), null);
    assert.equal(parsePendingAction('AGENT'), null);
  });

  it('expires after the TTL', () => {
    const action = { tool: 'log_food', args: {}, question: 'which meal?', createdAt: 0 };
    assert.equal(isPendingActionFresh(action, PENDING_ACTION_TTL_MS - 1), true);
    assert.equal(isPendingActionFresh(action, PENDING_ACTION_TTL_MS + 1), false);
  });

  it('round-trips a photo estimate stashed on a pending action', () => {
    const serialized = serializePendingAction({
      tool: 'log_food',
      args: { foodText: 'chips' },
      question: 'Which meal?',
      createdAt: 1,
      photoEstimate: {
        items: [{ name: 'chips', calories: 200, protein: 2, carbs: 24, fat: 11 }],
        mealName: 'Snack'
      }
    });
    const parsed = parsePendingAction(serialized);
    assert.ok(parsed?.photoEstimate);
    assert.equal(parsed.photoEstimate.items[0]?.calories, 200);
    assert.deepEqual(parseStoredPhotoEstimate(serialized)?.items[0]?.name, 'chips');
    assert.deepEqual(
      parseStoredPhotoEstimate(serializePhotoEstimateIntent([{ name: 'rice', calories: 200, protein: 4, carbs: 44, fat: 1 }], 'Lunch'))
        ?.items[0]?.name,
      'rice'
    );
  });
});
