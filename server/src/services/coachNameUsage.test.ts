import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VIRTUAL_COACH_NAME_USAGE } from '../data/virtualCoachPersonas.js';
import {
  applyCoachNameUsage,
  buildCoachNameUsageInstruction,
  shouldCoachUseFirstName
} from './coachNameUsage.js';

const everyOther = VIRTUAL_COACH_NAME_USAGE.tess;
const everyThird = VIRTUAL_COACH_NAME_USAGE.milo;

describe('shouldCoachUseFirstName', () => {
  it('uses every-third cadence for Milo', () => {
    assert.equal(shouldCoachUseFirstName(1, everyThird), true);
    assert.equal(shouldCoachUseFirstName(2, everyThird), false);
    assert.equal(shouldCoachUseFirstName(3, everyThird), false);
    assert.equal(shouldCoachUseFirstName(4, everyThird), true);
  });

  it('uses every-other cadence for Tess', () => {
    assert.equal(shouldCoachUseFirstName(1, everyOther), true);
    assert.equal(shouldCoachUseFirstName(2, everyOther), false);
    assert.equal(shouldCoachUseFirstName(3, everyOther), true);
  });
});

describe('buildCoachNameUsageInstruction', () => {
  it('tells the model to skip the name on Milo second messages', () => {
    const instruction = buildCoachNameUsageInstruction(2, 'Jake', everyThird);
    assert.match(instruction, /do not use/i);
  });
});

describe('applyCoachNameUsage', () => {
  it('keeps the name on the opening line and injects one when missing', () => {
    assert.match(applyCoachNameUsage('How are you feeling about the week?', 'Derek', 1, everyOther), /Derek/);
    assert.match(applyCoachNameUsage('Hi Derek. How are you feeling?', 'Derek', 1, everyOther), /Hi Derek/);
  });

  it('strips the name on even-numbered coach messages when interval is 2', () => {
    const stripped = applyCoachNameUsage('Okay Derek, what went well this week?', 'Derek', 2, everyOther);
    assert.doesNotMatch(stripped, /\bDerek\b/);
    assert.match(stripped, /what went well/i);
  });

  it('strips the name on the second coach message when interval is 3', () => {
    const stripped = applyCoachNameUsage('Hey Jake, here is the SMS setup.', 'Jake', 2, everyThird);
    assert.doesNotMatch(stripped, /\bJake\b/);
  });

  it('keeps or adds the name on odd-numbered coach messages after the opening', () => {
    assert.match(applyCoachNameUsage('Derek, what got in the way?', 'Derek', 3, everyOther), /\bDerek\b/);
    assert.match(applyCoachNameUsage('What got in the way?', 'Derek', 3, everyOther), /\bDerek\b/);
  });

  it('adds the name again on the fourth coach message when interval is 3', () => {
    assert.match(applyCoachNameUsage('Here is the next step.', 'Jake', 4, everyThird), /\bJake\b/);
  });

  it('always keeps the name on recap sign-off even on an even coach message number', () => {
    const closing = applyCoachNameUsage('Okay Derek, talk soon.', 'Derek', 8, everyOther, { isRecapClosing: true });
    assert.match(closing, /\bDerek\b/);
  });
});
