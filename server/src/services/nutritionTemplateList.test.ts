import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Visibility } from '@prisma/client';
import {
  clientScopedNutritionTemplateWhere,
  coachNutritionTemplateScope
} from './nutritionTemplateService.js';

describe('coach nutrition template scope', () => {
  it('scopes super admins to the client when clientId is set', () => {
    assert.equal(coachNutritionTemplateScope('amy', true), 'client');
    assert.equal(coachNutritionTemplateScope('amy', false), 'client');
    assert.equal(coachNutritionTemplateScope(undefined, true), 'all');
    assert.equal(coachNutritionTemplateScope(undefined, false), 'own-and-library');
  });

  it('keeps library plans, the viewing coach, and plans assigned to that client', () => {
    const where = clientScopedNutritionTemplateWhere({
      actorId: 'coach-1',
      profileMatch: { gender: 'f' },
      assignedIds: ['assigned-plan']
    });
    assert.deepEqual(where, {
      OR: [
        {
          AND: [{ OR: [{ visibility: Visibility.GLOBAL }, { createdById: 'coach-1' }] }, { gender: 'f' }]
        },
        { id: { in: ['assigned-plan'] } }
      ]
    });
  });

  it('does not list every template when nothing matches and nothing is assigned', () => {
    assert.equal(
      clientScopedNutritionTemplateWhere({
        actorId: 'coach-1',
        profileMatch: null,
        assignedIds: []
      }),
      null
    );
  });
});
