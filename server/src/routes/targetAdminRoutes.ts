import type { FastifyInstance } from 'fastify';
import { ProgramStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { requireRole } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';
import { n } from '../utils/numbers.js';
import { normalizeGender } from '../services/bloodPanelMetrics.js';
import {
  computeFormulaTargets,
  DEFAULT_TARGET_FORMULA,
  getTargetFormulaConfig,
  pickOverrideBand,
  TARGET_FORMULA_SETTING_KEY,
  targetFormulaConfigSchema
} from '../services/targetService.js';

/**
 * Tommy's oversight surface: tune the formula constants, pin override bands, and
 * review the population grid (segments × client counts × formula-vs-override).
 */

const adminOnly = [requireAuth, requireRole(['SUPER_ADMIN', 'ADMIN'])];

const bandBodySchema = z.object({
  gender: z.enum(['m', 'f']),
  heightMinInches: z.number().int().min(48).max(90),
  heightMaxInches: z.number().int().min(48).max(90),
  weightMinLbs: z.number().min(70).max(500),
  weightMaxLbs: z.number().min(70).max(500),
  activityLevelMin: z.number().int().min(1).max(5),
  activityLevelMax: z.number().int().min(1).max(5),
  calorieTarget: z.number().min(1000).max(4500),
  proteinTarget: z.number().min(40).max(300),
  carbTarget: z.number().min(0).max(600),
  fatTarget: z.number().min(0).max(250),
  notes: z.string().max(200).nullable().optional()
});

const previewSchema = z.object({
  gender: z.enum(['m', 'f']),
  heightInches: z.number().min(48).max(90),
  weightLbs: z.number().min(70).max(500),
  activityLevel: z.number().int().min(1).max(5).optional(),
  ageYears: z.number().int().min(14).max(100).optional()
});

export async function targetAdminRoutes(app: FastifyInstance) {
  /* ---------- formula ---------- */
  app.get('/api/admin/targets/formula', { preHandler: adminOnly }, async () => {
    const config = await getTargetFormulaConfig();
    const stored = await prisma.appSetting.findUnique({ where: { key: TARGET_FORMULA_SETTING_KEY } });
    return { config, isDefault: !stored, defaults: DEFAULT_TARGET_FORMULA };
  });

  app.put('/api/admin/targets/formula', { preHandler: adminOnly }, async (request) => {
    const config = targetFormulaConfigSchema.parse(request.body);
    await prisma.appSetting.upsert({
      where: { key: TARGET_FORMULA_SETTING_KEY },
      create: { key: TARGET_FORMULA_SETTING_KEY, value: JSON.stringify(config) },
      update: { value: JSON.stringify(config) }
    });
    return { config, isDefault: false };
  });

  app.post('/api/admin/targets/preview', { preHandler: adminOnly }, async (request) => {
    const profile = previewSchema.parse(request.body);
    const config = await getTargetFormulaConfig();
    const formula = computeFormulaTargets(profile, config);
    const bands = await prisma.targetOverrideBand.findMany({ where: { gender: profile.gender } });
    const band = pickOverrideBand(bands, {
      gender: profile.gender,
      heightInches: profile.heightInches,
      weightLbs: profile.weightLbs,
      activityLevel: profile.activityLevel ?? 2
    });
    return {
      formula,
      override: band
        ? {
            id: band.id,
            calorieTarget: Math.round(n(band.calorieTarget)),
            proteinTarget: Math.round(n(band.proteinTarget)),
            notes: (band as { notes?: string | null }).notes ?? null
          }
        : null
    };
  });

  /* ---------- override bands ---------- */
  app.get('/api/admin/targets/bands', { preHandler: adminOnly }, async () =>
    prisma.targetOverrideBand.findMany({ orderBy: [{ gender: 'asc' }, { heightMinInches: 'asc' }, { weightMinLbs: 'asc' }] })
  );

  app.post('/api/admin/targets/bands', { preHandler: adminOnly }, async (request) => {
    const body = bandBodySchema.parse(request.body);
    return prisma.targetOverrideBand.create({ data: { ...body, createdById: request.appUser!.id } });
  });

  app.patch('/api/admin/targets/bands/:id', { preHandler: adminOnly }, async (request) => {
    const body = bandBodySchema.partial().parse(request.body);
    return prisma.targetOverrideBand.update({ where: { id: (request.params as { id: string }).id }, data: body });
  });

  app.delete('/api/admin/targets/bands/:id', { preHandler: adminOnly }, async (request) => {
    await prisma.targetOverrideBand.delete({ where: { id: (request.params as { id: string }).id } });
    return { deleted: true };
  });

  /* ---------- population grid ---------- */
  app.get('/api/admin/targets/population', { preHandler: adminOnly }, async () => {
    const [users, bands, config] = await Promise.all([
      prisma.user.findMany({
        where: { status: 'ACTIVE', role: 'USER' },
        select: {
          gender: true,
          clientProfile: { select: { heightInches: true, activityLevel: true } },
          programs: {
            where: { status: ProgramStatus.ACTIVE },
            select: { metrics: { where: { metricType: 'WEIGHT' }, select: { currentValue: true } } }
          }
        }
      }),
      prisma.targetOverrideBand.findMany(),
      getTargetFormulaConfig()
    ]);

    const HEIGHT_STEP = 3;
    const WEIGHT_STEP = 30;
    type Segment = { gender: 'm' | 'f'; h0: number; w0: number; count: number };
    const segments = new Map<string, Segment>();
    let incomplete = 0;

    for (const user of users) {
      const gender = normalizeGender(user.gender);
      const height = user.clientProfile?.heightInches ?? null;
      const weight = user.programs[0]?.metrics[0] ? n(user.programs[0].metrics[0].currentValue) : null;
      if ((gender !== 'm' && gender !== 'f') || !height || !weight || weight <= 0) {
        incomplete += 1;
        continue;
      }
      const h0 = Math.floor(height / HEIGHT_STEP) * HEIGHT_STEP;
      const w0 = Math.floor(weight / WEIGHT_STEP) * WEIGHT_STEP;
      const key = `${gender}|${h0}|${w0}`;
      const segment = segments.get(key) ?? { gender, h0, w0, count: 0 };
      segment.count += 1;
      segments.set(key, segment);
    }

    const rows = [...segments.values()]
      .sort((a, b) => b.count - a.count)
      .map((segment) => {
        const representative = {
          gender: segment.gender,
          heightInches: segment.h0 + HEIGHT_STEP / 2,
          weightLbs: segment.w0 + WEIGHT_STEP / 2,
          activityLevel: 2
        };
        const formula = computeFormulaTargets(representative, config);
        const band = pickOverrideBand(
          bands.filter((candidate) => candidate.gender === segment.gender),
          representative
        );
        return {
          gender: segment.gender,
          heightRange: `${segment.h0}–${segment.h0 + HEIGHT_STEP}"`,
          weightRange: `${segment.w0}–${segment.w0 + WEIGHT_STEP} lbs`,
          clients: segment.count,
          formula,
          override: band
            ? { id: band.id, calorieTarget: Math.round(n(band.calorieTarget)), proteinTarget: Math.round(n(band.proteinTarget)) }
            : null
        };
      });

    return { rows, incompleteProfiles: incomplete, totalUsers: users.length };
  });
}
