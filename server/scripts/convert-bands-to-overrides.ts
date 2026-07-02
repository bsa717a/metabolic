/**
 * Stage-1 migration for the target-formula plan: converts the global band templates'
 * TARGETS into TargetOverrideBand rows (Tommy's initial overrides).
 *
 * Discovery that shaped this: within each gender×height band the templates have
 * IDENTICAL criteria (same weight/activity ranges) and near-identical targets
 * (spread ~45 kcal, with exact duplicates) — today's matcher breaks those ties
 * arbitrarily by updatedAt. So instead of converting 61 ambiguous rows, each
 * identical-criteria GROUP collapses into ONE override band carrying the group's
 * MEDIAN targets. Continuity check asserts every currently-matched user's new
 * targets stay within their group's original spread.
 *
 * Dry-run by default:
 *   cd server && npx tsx --env-file=.env scripts/convert-bands-to-overrides.ts [--apply]
 */
import { PrismaClient, ProgramStatus, Visibility } from '@prisma/client';
import {
  buildProfileFromInput,
  findBestMatchingTemplate,
  hasCompleteTemplateCriteria,
  isCompletePlanMatchProfile
} from '../src/services/nutritionTemplateMatch.js';
import { pickOverrideBand } from '../src/services/targetService.js';
import { normalizeGender } from '../src/services/bloodPanelMetrics.js';
import { n } from '../src/utils/numbers.js';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Convert band templates → override bands ${apply ? '(APPLY)' : '(dry run — pass --apply to write)'}`);

  const templates = await prisma.nutritionPlanTemplate.findMany({
    where: { visibility: Visibility.GLOBAL }
  });
  const complete = templates.filter(hasCompleteTemplateCriteria);
  console.log(`global templates: ${templates.length}, with complete criteria: ${complete.length}`);

  // Group by identical criteria; each group becomes one median-target band.
  const groups = new Map<string, typeof complete>();
  for (const template of complete) {
    const key = [
      template.gender,
      template.heightMinInches,
      template.heightMaxInches,
      n(template.weightMinLbs),
      n(template.weightMaxLbs),
      template.activityLevelMin,
      template.activityLevelMax
    ].join('|');
    groups.set(key, [...(groups.get(key) ?? []), template]);
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };

  const existing = await prisma.targetOverrideBand.findMany({ select: { notes: true } });
  const existingNotes = new Set(existing.map((band) => band.notes));

  const collapsed: Array<{
    gender: string;
    heightMinInches: number;
    heightMaxInches: number;
    weightMinLbs: number;
    weightMaxLbs: number;
    activityLevelMin: number;
    activityLevelMax: number;
    calorieTarget: number;
    proteinTarget: number;
    carbTarget: number;
    fatTarget: number;
    note: string;
    spreadKcal: number;
  }> = [];
  for (const group of groups.values()) {
    const first = group[0];
    const calories = group.map((t) => n(t.calorieTarget));
    collapsed.push({
      gender: first.gender!,
      heightMinInches: first.heightMinInches!,
      heightMaxInches: first.heightMaxInches!,
      weightMinLbs: n(first.weightMinLbs),
      weightMaxLbs: n(first.weightMaxLbs),
      activityLevelMin: first.activityLevelMin!,
      activityLevelMax: first.activityLevelMax!,
      calorieTarget: median(calories),
      proteinTarget: median(group.map((t) => n(t.proteinTarget))),
      carbTarget: median(group.map((t) => n(t.carbTarget))),
      fatTarget: median(group.map((t) => n(t.fatTarget))),
      note: `Converted from ${group.length} templates (${first.gender} ${first.heightMinInches}-${first.heightMaxInches}in), median of ${Math.min(...calories)}-${Math.max(...calories)} kcal`,
      spreadKcal: Math.max(...calories) - Math.min(...calories)
    });
  }

  let created = 0;
  let skipped = 0;
  for (const band of collapsed) {
    console.log(
      `  band ${band.gender} ${band.heightMinInches}-${band.heightMaxInches}" ${band.weightMinLbs}-${band.weightMaxLbs}lbs → ` +
        `${band.calorieTarget} kcal / ${band.proteinTarget}p (group spread ${band.spreadKcal} kcal)`
    );
    if (existingNotes.has(band.note)) {
      skipped += 1;
      continue;
    }
    created += 1;
    if (apply) {
      const { note, spreadKcal: _spread, ...data } = band;
      await prisma.targetOverrideBand.create({ data: { ...data, notes: note } });
    }
  }
  console.log(`override bands: ${created} to create (from ${groups.size} criteria groups), ${skipped} already converted`);

  // Continuity check — old matcher's targets === new band resolution's targets.
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', role: 'USER' },
    select: {
      id: true,
      email: true,
      gender: true,
      clientProfile: { select: { heightInches: true, activityLevel: true } },
      programs: {
        where: { status: ProgramStatus.ACTIVE },
        select: { metrics: { where: { metricType: 'WEIGHT' }, select: { currentValue: true } } }
      }
    }
  });

  const bandRows = (apply ? await prisma.targetOverrideBand.findMany() : []).length
    ? await prisma.targetOverrideBand.findMany()
    : collapsed.map((band, index) => ({ id: `pending-${index}`, ...band }));

  let checked = 0;
  let withinSpread = 0;
  let maxDriftKcal = 0;
  const problems: string[] = [];
  for (const user of users) {
    const profile = buildProfileFromInput({
      gender: normalizeGender(user.gender) ?? undefined,
      heightInchesTotal: user.clientProfile?.heightInches ?? undefined,
      weightLbs: user.programs[0]?.metrics[0] ? n(user.programs[0].metrics[0].currentValue) : undefined,
      activityLevel: user.clientProfile?.activityLevel ?? 2
    });
    if (!isCompletePlanMatchProfile(profile)) continue;
    const oldMatch = await findBestMatchingTemplate(profile, { visibility: Visibility.GLOBAL });
    if (!oldMatch) continue;
    checked += 1;
    const band = pickOverrideBand(bandRows, profile);
    if (!band) {
      if (problems.length < 10) problems.push(`${user.email}: matched ${oldMatch.name} but NO override band`);
      continue;
    }
    const drift = Math.abs(n(band.calorieTarget) - n(oldMatch.calorieTarget));
    maxDriftKcal = Math.max(maxDriftKcal, drift);
    // The old assignment within a group was an arbitrary updatedAt tie-break; the
    // guarantee is the new target stays within the group's original spread.
    if (drift <= 50) withinSpread += 1;
    else if (problems.length < 10) problems.push(`${user.email}: drift ${drift} kcal (${oldMatch.name})`);
  }
  console.log(`continuity: ${withinSpread}/${checked} matched users within 50 kcal of their (arbitrary) old match; max drift ${maxDriftKcal} kcal`);
  if (problems.length) console.log(`PROBLEMS:\n  ${problems.join('\n  ')}`);
  console.log(apply ? 'Done.' : 'Dry run complete — nothing written.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
