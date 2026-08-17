import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nameLooksLikeGymOnly } from './exerciseGymHeuristic.js';

describe('nameLooksLikeGymOnly', () => {
  it('marks commercial gym equipment', () => {
    assert.equal(nameLooksLikeGymOnly('Leg press'), true);
    assert.equal(nameLooksLikeGymOnly('Cable seated row'), true);
    assert.equal(nameLooksLikeGymOnly('Smith machine squat'), true);
    assert.equal(nameLooksLikeGymOnly('Lat pulldown'), true);
    assert.equal(nameLooksLikeGymOnly('Preacher curl machine'), true);
  });

  it('keeps typical home-gym equipment unmarked', () => {
    assert.equal(nameLooksLikeGymOnly('Goblet squat'), false);
    assert.equal(nameLooksLikeGymOnly('Dumbbell chest press'), false);
    assert.equal(nameLooksLikeGymOnly('Band seated row'), false);
    assert.equal(nameLooksLikeGymOnly('Kettlebell swing'), false);
    assert.equal(nameLooksLikeGymOnly('Push-up'), false);
    assert.equal(nameLooksLikeGymOnly('Physioball - Ball Hip Up with Leg Curl'), false);
  });
});
