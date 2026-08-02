import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isReflectionUnlocked, isReminderWindowOpen } from './unlockTiming.js';
import type { DiscoveryTimingConfig } from './types.js';

const timing: DiscoveryTimingConfig = {
  minExperienceHoursBeforeEveningUnlock: 2,
  reflectionUnlockLocalHour: 18,
  minExperienceHoursAbsolute: 6,
  reminderLocalHourStart: 10,
  reminderLocalHourEnd: 16,
  maxRemindersPerDay: 2
};

describe('isReflectionUnlocked', () => {
  it('stays locked before minimum evening hours', () => {
    const started = new Date('2026-08-01T12:00:00.000Z');
    const now = new Date('2026-08-01T13:00:00.000Z');
    assert.equal(
      isReflectionUnlocked({
        experienceStartedAt: started,
        timing,
        timeZone: 'UTC',
        now
      }),
      false
    );
  });

  it('unlocks after absolute hours even before evening', () => {
    const started = new Date('2026-08-01T08:00:00.000Z');
    const now = new Date('2026-08-01T14:30:00.000Z');
    assert.equal(
      isReflectionUnlocked({
        experienceStartedAt: started,
        timing,
        timeZone: 'UTC',
        now
      }),
      true
    );
  });

  it('unlocks at evening hour after min evening hours', () => {
    const started = new Date('2026-08-01T14:00:00.000Z');
    const now = new Date('2026-08-01T18:30:00.000Z');
    assert.equal(
      isReflectionUnlocked({
        experienceStartedAt: started,
        timing,
        timeZone: 'UTC',
        now
      }),
      true
    );
  });

  it('returns false without experienceStartedAt', () => {
    assert.equal(
      isReflectionUnlocked({
        experienceStartedAt: null,
        timing,
        timeZone: 'UTC',
        now: new Date()
      }),
      false
    );
  });
});

describe('isReminderWindowOpen', () => {
  it('is open inside configured hours', () => {
    const now = new Date('2026-08-01T12:00:00.000Z');
    assert.equal(isReminderWindowOpen({ timing, timeZone: 'UTC', now }), true);
  });

  it('is closed outside configured hours', () => {
    const now = new Date('2026-08-01T18:00:00.000Z');
    assert.equal(isReminderWindowOpen({ timing, timeZone: 'UTC', now }), false);
  });
});
