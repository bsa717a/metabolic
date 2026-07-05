import type { FastifyReply, FastifyRequest } from 'fastify';
import { PlanTier } from '@prisma/client';
import { isAdmin } from './requireRole.js';
import {
  getRequiredPlan,
  getUpgradePlan,
  hasCoachFeature,
  hasFeature,
  planToSlug,
  type FeatureKey
} from '../services/entitlements.js';

async function userHasFeature(user: NonNullable<FastifyRequest['appUser']>, feature: FeatureKey) {
  const requiredPlan = getRequiredPlan(feature);
  return requiredPlan === PlanTier.COACH_LED
    ? hasCoachFeature(user, feature)
    : hasFeature(user, feature);
}

function sendUpgradeRequired(
  reply: FastifyReply,
  user: NonNullable<FastifyRequest['appUser']>,
  feature: FeatureKey
) {
  const requiredPlan = getRequiredPlan(feature);
  const currentPlan = user.plan;
  const upgradePlan = getUpgradePlan(currentPlan, requiredPlan);

  return reply.code(402).send({
    error: 'Upgrade required',
    feature,
    requiredPlan: planToSlug(requiredPlan),
    currentPlan: planToSlug(currentPlan),
    upgradePlan: planToSlug(upgradePlan)
  });
}

export function requireFeature(feature: FeatureKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.appUser;
    if (!user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    if (isAdmin(user)) return;

    if (await userHasFeature(user, feature)) return;

    return sendUpgradeRequired(reply, user, feature);
  };
}

export function requireAnyFeature(...features: FeatureKey[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.appUser;
    if (!user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    if (isAdmin(user)) return;

    for (const feature of features) {
      if (await userHasFeature(user, feature)) return;
    }

    return sendUpgradeRequired(reply, user, features[0]!);
  };
}
