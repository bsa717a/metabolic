/**
 * Backfill NutritionPlanTemplate criteria from legacy titles and refresh descriptions.
 *
 *   cd server && npx tsx --env-file=.env scripts/backfill-nutrition-plan-criteria.ts
 *   cd server && npx tsx --env-file=.env scripts/backfill-nutrition-plan-criteria.ts --apply
 */
import { prisma } from '../src/db/prisma.js';

const apply = process.argv.includes('--apply');

const TITLE_PATTERN = /^(\d+)'(\d+)"\s+(Male|Female)(?:\s+Week\s+\d+)?$/i;

const WEIGHT_RANGES: Record<string, { min: number; max: number }> = {
  '64|f': { min: 110, max: 160 },
  '66|f': { min: 115, max: 170 },
  '68|m': { min: 140, max: 200 },
  '71|m': { min: 150, max: 215 },
  '74|m': { min: 165, max: 235 }
};

function parseHeightInches(feet: number, inches: number) {
  return feet * 12 + inches;
}

function weightRangeFor(heightInches: number, gender: 'm' | 'f') {
  const key = `${heightInches}|${gender}`;
  if (WEIGHT_RANGES[key]) return WEIGHT_RANGES[key];
  const fallbackSpan = gender === 'f' ? 45 : 55;
  const midpoint = gender === 'f' ? 135 : 185;
  return { min: midpoint - fallbackSpan, max: midpoint + fallbackSpan };
}

function roundMacro(value: unknown) {
  return Math.round(Number(value));
}

function formatMacroDescription(template: {
  calorieTarget: unknown;
  proteinTarget: unknown;
  carbTarget: unknown;
  fatTarget: unknown;
}) {
  return `${roundMacro(template.calorieTarget)} kcal · ${roundMacro(template.proteinTarget)}g protein · ${roundMacro(template.carbTarget)}g carbs · ${roundMacro(template.fatTarget)}g fat`;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractSubstitutionSections(description: string | null) {
  if (!description?.trim()) return { meat: null as string | null, starch: null as string | null };

  const meatMatch = description.match(/Meat Subs:\s*([\s\S]*?)(?=Starch Subs:|$)/i);
  const starchMatch = description.match(/Starch Subs:\s*([\s\S]*?)$/i);

  return {
    meat: meatMatch ? normalizeWhitespace(meatMatch[1]) : null,
    starch: starchMatch ? normalizeWhitespace(starchMatch[1]) : null
  };
}

function buildDescription(template: {
  description: string | null;
  calorieTarget: unknown;
  proteinTarget: unknown;
  carbTarget: unknown;
  fatTarget: unknown;
}) {
  const lines = [formatMacroDescription(template)];
  const { meat, starch } = extractSubstitutionSections(template.description);

  if (meat) {
    lines.push('', `Meat substitutions: ${meat.replace(/,\s*$/, '')}.`);
  }
  if (starch) {
    lines.push('', `Starch substitutions: ${starch.replace(/,\s*$/, '')}.`);
  }

  return lines.join('\n');
}

function buildName(parsed: { heightLabel: string; genderLabel: string; calories: number }) {
  return `${parsed.heightLabel} ${parsed.genderLabel} · ${parsed.calories} kcal`;
}

function parseTitle(name: string) {
  const match = name.match(TITLE_PATTERN);
  if (!match) return null;

  const feet = Number(match[1]);
  const inches = Number(match[2]);
  const genderLabel = match[3];
  const gender = genderLabel.toLowerCase() === 'male' ? 'm' : 'f';
  const heightInches = parseHeightInches(feet, inches);
  const heightLabel = `${feet}'${inches}"`;

  return {
    gender,
    genderLabel: genderLabel[0]!.toUpperCase() + genderLabel.slice(1).toLowerCase(),
    heightInches,
    heightLabel,
    heightMinInches: heightInches - 1,
    heightMaxInches: heightInches + 1
  };
}

async function main() {
  const templates = await prisma.nutritionPlanTemplate.findMany({
    orderBy: { name: 'asc' }
  });

  const updates: Array<{
    id: string;
    before: string;
    after: { name: string; description: string; criteria: Record<string, unknown> };
  }> = [];
  const skipped: string[] = [];

  for (const template of templates) {
    const parsed = parseTitle(template.name);
    const description = buildDescription(template);

    if (!parsed) {
      skipped.push(`${template.name} (${template.id})`);
      if (template.description !== description) {
        updates.push({
          id: template.id,
          before: template.name,
          after: {
            name: template.name,
            description,
            criteria: {}
          }
        });
      }
      continue;
    }

    const weight = weightRangeFor(parsed.heightInches, parsed.gender);
    const calories = roundMacro(template.calorieTarget);
    const name = buildName({ ...parsed, calories });

    updates.push({
      id: template.id,
      before: template.name,
      after: {
        name,
        description,
        criteria: {
          gender: parsed.gender,
          heightMinInches: parsed.heightMinInches,
          heightMaxInches: parsed.heightMaxInches,
          weightMinLbs: weight.min,
          weightMaxLbs: weight.max,
          activityLevelMin: 1,
          activityLevelMax: 5
        }
      }
    });
  }

  console.log(`Found ${templates.length} plans; ${updates.length} to update; ${skipped.length} without parseable titles.`);
  if (skipped.length) {
    console.log('\nSkipped title parsing (description/macros only):');
    for (const line of skipped) console.log(`  - ${line}`);
  }

  console.log('\nSample updates:');
  for (const row of updates.slice(0, 5)) {
    console.log(`  ${row.before}`);
    console.log(`    -> ${row.after.name}`);
    console.log(`    -> ${row.after.description.split('\n')[0]}`);
    if (Object.keys(row.after.criteria).length) {
      console.log(`    -> criteria: ${JSON.stringify(row.after.criteria)}`);
    }
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    return;
  }

  let written = 0;
  for (const row of updates) {
    const criteria = row.after.criteria;
    await prisma.nutritionPlanTemplate.update({
      where: { id: row.id },
      data: {
        name: row.after.name,
        description: row.after.description,
        ...(Object.keys(criteria).length
          ? {
              gender: criteria.gender as 'm' | 'f',
              heightMinInches: criteria.heightMinInches as number,
              heightMaxInches: criteria.heightMaxInches as number,
              weightMinLbs: criteria.weightMinLbs as number,
              weightMaxLbs: criteria.weightMaxLbs as number,
              activityLevelMin: criteria.activityLevelMin as number,
              activityLevelMax: criteria.activityLevelMax as number
            }
          : {})
      }
    });
    written += 1;
  }

  console.log(`\nUpdated ${written} plans.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
