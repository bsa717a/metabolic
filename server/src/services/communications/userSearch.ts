import type { PlanTier, Prisma, Role, UserStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import {
  buildUnsubscribeMatcherForCategory,
  findIsUnsubscribedOnAnyOptionalChannel
} from './unsubscribeService.js';
import type { CommunicationUser, RecipientInput } from './types.js';

export interface UserFilterParams {
  q?: string;
  role?: string;
  status?: string;
  plan?: string;
  organizationId?: string;
  subscription?: string;
  limit?: number;
  offset?: number;
}

function displayName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim() || 'User';
}

async function toCommunicationUser(
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: Role;
    status: UserStatus;
    plan: PlanTier;
    organizations: { organizationId: string; organization: { name: string } }[];
  },
  unsubscribed: boolean
): Promise<CommunicationUser> {
  const org = user.organizations[0];
  return {
    userId: user.id,
    displayName: displayName(user),
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    plan: user.plan,
    organizationId: org?.organizationId ?? null,
    organizationName: org?.organization.name ?? null,
    isSubscribed: !unsubscribed,
    isExternal: false
  };
}

function buildWhere(params: UserFilterParams): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  const and: Prisma.UserWhereInput[] = [];

  if (params.q?.trim()) {
    const q = params.q.trim();
    and.push({
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } }
      ]
    });
  }
  if (params.role) where.role = params.role as Role;
  if (params.status) where.status = params.status as UserStatus;
  if (params.plan) where.plan = params.plan as PlanTier;
  if (params.organizationId) {
    and.push({ organizations: { some: { organizationId: params.organizationId } } });
  }

  if (and.length) where.AND = and;
  return where;
}

function wantsSubscriptionFilter(subscription?: string): subscription is 'subscribed' | 'unsubscribed' {
  return subscription === 'subscribed' || subscription === 'unsubscribed';
}

export async function searchCommunicationUsers(params: UserFilterParams): Promise<{
  users: CommunicationUser[];
  total: number;
}> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const where = buildWhere(params);

  // Without a subscription filter, DB pagination is exact.
  if (!wantsSubscriptionFilter(params.subscription)) {
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: offset,
        take: limit,
        include: {
          organizations: {
            take: 1,
            include: { organization: { select: { name: true } } }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    const users: CommunicationUser[] = [];
    for (const row of rows) {
      const unsubscribed = await findIsUnsubscribedOnAnyOptionalChannel({
        userId: row.id,
        email: row.email,
        phone: row.phone
      });
      users.push(await toCommunicationUser(row, unsubscribed));
    }
    return { users, total };
  }

  // Subscription status lives outside User; scan in pages and filter in memory.
  const isUnsubscribed = await buildUnsubscribeMatcherForCategory(null);
  const pageSize = 200;
  let skip = 0;
  let matched = 0;
  const users: CommunicationUser[] = [];
  let totalMatches = 0;
  let exhausted = false;

  while (!exhausted && users.length < limit) {
    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip,
      take: pageSize,
      include: {
        organizations: {
          take: 1,
          include: { organization: { select: { name: true } } }
        }
      }
    });
    if (rows.length < pageSize) exhausted = true;
    skip += rows.length;

    for (const row of rows) {
      const unsubscribed = isUnsubscribed({
        userId: row.id,
        email: row.email,
        phone: row.phone,
        channel: 'email'
      });
      const keep =
        params.subscription === 'subscribed' ? !unsubscribed : unsubscribed;
      if (!keep) continue;
      totalMatches += 1;
      if (matched >= offset && users.length < limit) {
        users.push(await toCommunicationUser(row, unsubscribed));
      }
      matched += 1;
    }
  }

  // If we stopped early because the page filled, keep scanning to finish total.
  while (!exhausted) {
    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip,
      take: pageSize,
      select: { id: true, email: true, phone: true }
    });
    if (rows.length < pageSize) exhausted = true;
    skip += rows.length;
    for (const row of rows) {
      const unsubscribed = isUnsubscribed({
        userId: row.id,
        email: row.email,
        phone: row.phone,
        channel: 'email'
      });
      const keep =
        params.subscription === 'subscribed' ? !unsubscribed : unsubscribed;
      if (keep) totalMatches += 1;
    }
  }

  return { users, total: totalMatches };
}

export async function searchAllCommunicationUsers(params: UserFilterParams): Promise<{
  recipients: RecipientInput[];
  total: number;
  truncated: boolean;
}> {
  const max = 2000;
  const where = buildWhere(params);
  const isUnsubscribed = wantsSubscriptionFilter(params.subscription)
    ? await buildUnsubscribeMatcherForCategory(null)
    : null;

  const recipients: RecipientInput[] = [];
  const pageSize = 500;
  let skip = 0;
  let truncated = false;
  let exhausted = false;

  while (!exhausted && recipients.length < max) {
    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true
      }
    });
    if (rows.length < pageSize) exhausted = true;
    skip += rows.length;

    for (const row of rows) {
      if (isUnsubscribed) {
        const unsubscribed = isUnsubscribed({
          userId: row.id,
          email: row.email,
          phone: row.phone,
          channel: 'email'
        });
        if (params.subscription === 'subscribed' && unsubscribed) continue;
        if (params.subscription === 'unsubscribed' && !unsubscribed) continue;
      }
      if (recipients.length >= max) {
        truncated = true;
        break;
      }
      recipients.push({
        userId: row.id,
        displayName: displayName(row),
        email: row.email,
        phone: row.phone,
        isExternal: false
      });
    }
  }

  // If we filled max mid-page, there may still be more matching users.
  if (!truncated && !exhausted) {
    truncated = true;
  } else if (truncated) {
    // Confirm there is at least one more match beyond the cap.
    let hasMore = false;
    while (!hasMore && !exhausted) {
      const rows = await prisma.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip,
        take: pageSize,
        select: { id: true, email: true, phone: true }
      });
      if (rows.length < pageSize) exhausted = true;
      skip += rows.length;
      for (const row of rows) {
        if (!isUnsubscribed) {
          hasMore = true;
          break;
        }
        const unsubscribed = isUnsubscribed({
          userId: row.id,
          email: row.email,
          phone: row.phone,
          channel: 'email'
        });
        const keep =
          params.subscription === 'subscribed' ? !unsubscribed : unsubscribed;
        if (keep) {
          hasMore = true;
          break;
        }
      }
    }
    truncated = hasMore;
  }

  return {
    recipients,
    total: truncated ? recipients.length + 1 : recipients.length,
    truncated
  };
}

export async function searchRecipientsByQuery(q: string): Promise<CommunicationUser[]> {
  if (!q.trim()) return [];
  const { users } = await searchCommunicationUsers({ q, limit: 20 });
  return users;
}

export async function getFilterOptions() {
  const organizations = await prisma.organization.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });
  return {
    organizations,
    roles: ['SUPER_ADMIN', 'ADMIN', 'COACH', 'USER', 'VIEWER'],
    plans: ['STARTER', 'SELF_GUIDED', 'PLUS', 'COACH_LED'],
    statuses: ['ACTIVE', 'INVITED', 'DISABLED']
  };
}
