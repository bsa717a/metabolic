import { describe, expect, it } from 'vitest';
import { FORMULA_STEP_CITATIONS, OTHER_METHODOLOGY } from './nutritionSources';

const STEP_TITLES = [
  'Basal metabolic rate (BMR)',
  'Total daily energy expenditure (TDEE)',
  'Calorie target',
  'Protein',
  'Carbs and fat'
];

describe('nutrition source citations', () => {
  it('cites every formula step the breakdown shows', () => {
    expect(Object.keys(FORMULA_STEP_CITATIONS).sort()).toEqual([...STEP_TITLES].sort());
  });

  it('uses https links for every citation', () => {
    const urls = [
      ...Object.values(FORMULA_STEP_CITATIONS).map((entry) => entry.citation.url),
      ...OTHER_METHODOLOGY.flatMap((note) => (note.citation ? [note.citation.url] : []))
    ];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('https://')).toBe(true);
      expect(() => new URL(url)).not.toThrow();
    }
  });
});
