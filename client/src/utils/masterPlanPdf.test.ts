import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildMasterPlanPdf, sanitizePdfText } from './masterPlanPdf';
import { buildMasterPlanDocument } from './masterPlanPdfModel';

const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
);

describe('buildMasterPlanPdf', () => {
  it('writes one page per week and embeds a raster logo', async () => {
    const doc = buildMasterPlanDocument({
      clientName: 'Jordan Hale',
      layout: 'horizontal',
      waterGoalOz: 80,
      weeks: [
        {
          weekNumber: 4,
          startDate: '2026-10-05',
          days: [
            {
              date: '2026-10-05',
              meals: [
                {
                  mealNumber: 1,
                  name: 'Breakfast',
                  items: [{ quantity: 6, unit: 'oz', nameSnapshot: 'egg whites' }]
                }
              ],
              exercises: [{ name: 'Goblet squat', sets: 3, reps: '10', weight: 25 }],
              notes: { dayNote: 'slept late 😴' }
            }
          ]
        },
        {
          weekNumber: 5,
          startDate: '2026-10-12',
          days: [
            {
              date: '2026-10-12',
              meals: [
                {
                  mealNumber: 1,
                  name: 'Breakfast',
                  items: [{ quantity: 1, unit: 'cup', nameSnapshot: 'oats' }]
                }
              ],
              exercises: []
            }
          ]
        }
      ]
    });

    const bytes = await buildMasterPlanPdf(doc, { logoPng: TINY_PNG });
    const pdf = await PDFDocument.load(bytes);
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(pdf.getPageCount()).toBe(2);
    expect(sanitizePdfText('slept late 😴')).toBe('slept late ');
  });
});
