import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Visibility } from '@prisma/client';
import { clientCanAccessExerciseTemplate } from './exerciseTemplateService.js';

describe('clientCanAccessExerciseTemplate', () => {
  const clientId = 'client-1';

  it('allows global plan days', () => {
    assert.equal(
      clientCanAccessExerciseTemplate({ visibility: Visibility.GLOBAL, createdById: 'admin' }, clientId),
      true
    );
  });

  it('allows the client’s own user workouts', () => {
    assert.equal(
      clientCanAccessExerciseTemplate({ visibility: Visibility.USER, createdById: clientId }, clientId),
      true
    );
  });

  it('rejects another user’s workouts', () => {
    assert.equal(
      clientCanAccessExerciseTemplate({ visibility: Visibility.USER, createdById: 'other-client' }, clientId),
      false
    );
  });
});
