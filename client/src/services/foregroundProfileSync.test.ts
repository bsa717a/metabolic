import { describe, expect, it } from 'vitest';
import { applyForegroundProfileSync } from './foregroundProfileSync';

describe('applyForegroundProfileSync', () => {
  it('applies the Apple user after /api/me so a slower profile response cannot win', async () => {
    const applied: string[] = [];
    let generation = 0;

    const first = applyForegroundProfileSync({
      generation: ++generation,
      isCurrent: (value) => value === generation,
      loadMe: () => new Promise((resolve) => setTimeout(() => resolve('me-old'), 30)),
      syncApple: () => Promise.resolve('apple-old'),
      apply: (user) => applied.push(user)
    });
    const second = applyForegroundProfileSync({
      generation: ++generation,
      isCurrent: (value) => value === generation,
      loadMe: () => Promise.resolve('me-new'),
      syncApple: () => Promise.resolve('apple-new'),
      apply: (user) => applied.push(user)
    });

    await Promise.all([first, second]);

    expect(applied).toEqual(['me-new', 'apple-new']);
  });

  it('keeps the profile user when Apple sync returns nothing', async () => {
    const applied: string[] = [];
    await applyForegroundProfileSync({
      generation: 1,
      isCurrent: () => true,
      loadMe: () => Promise.resolve('me'),
      syncApple: () => Promise.resolve(null),
      apply: (user) => applied.push(user)
    });
    expect(applied).toEqual(['me']);
  });
});
