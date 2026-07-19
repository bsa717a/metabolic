import { prisma } from '../../db/prisma.js';
import { normalizeEmail } from './validation.js';

export const normalizePhone = (phone: string | null | undefined): string | null =>
  phone ? String(phone).trim() : null;

export const buildPhoneVariants = (phone: string | null | undefined): string[] => {
  if (!phone) return [];
  const trimmed = String(phone).trim();
  const digits = trimmed.replace(/\D/g, '');
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
    if (digits.length === 10) {
      variants.add(`1${digits}`);
      variants.add(`+1${digits}`);
      variants.add(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
      variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      const tenDigit = digits.slice(1);
      variants.add(tenDigit);
      variants.add(`+${tenDigit}`);
      variants.add(`+1${tenDigit}`);
      variants.add(`(${tenDigit.slice(0, 3)}) ${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`);
      variants.add(`${tenDigit.slice(0, 3)}-${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`);
    }
  }
  return [...variants];
};

export const buildUnsubscribeMatcherForCategory = async (
  category: string | null
): Promise<(params: {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  channel: string;
}) => boolean> => {
  const rows = await prisma.communicationUnsubscribe.findMany({
    where: { OR: [{ category: null }, { category: category ?? null }] },
    select: { userId: true, email: true, phone: true, channel: true }
  });

  const channelMatches = (rowChannel: string, targetChannel: string): boolean => {
    if (targetChannel === 'email') return rowChannel === 'email' || rowChannel === 'all';
    return rowChannel === 'text' || rowChannel === 'all';
  };

  return ({ userId, email, phone, channel }) =>
    rows.some((row) => {
      if (!channelMatches(row.channel, channel)) return false;
      if (userId && row.userId === userId) return true;

      const normalized = normalizeEmail(email);
      if (normalized && row.email && normalizeEmail(row.email) === normalized) return true;

      if (!row.phone || !phone) return false;
      const targetVariants = new Set(buildPhoneVariants(phone));
      return buildPhoneVariants(row.phone).some((variant) => targetVariants.has(variant));
    });
};

export const findIsUnsubscribedOnAnyOptionalChannel = async ({
  userId,
  email,
  phone
}: {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<boolean> => {
  const matcher = await buildUnsubscribeMatcherForCategory(null);
  if (matcher({ userId, email, phone, channel: 'email' })) return true;
  return matcher({ userId, email, phone, channel: 'text' });
};

export async function saveUnsubscribe(data: {
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  channel?: string;
  category?: string | null;
  token?: string | null;
  source: string;
}) {
  const normalizedEmail = normalizeEmail(data.email);
  const normalizedPhone = normalizePhone(data.phone);
  const channelFilters =
    data.channel === 'email'
      ? ['email', 'all']
      : data.channel === 'text'
        ? ['text', 'all']
        : ['all', 'email', 'text'];

  const andClauses: object[] = [];
  if (data.userId) andClauses.push({ userId: data.userId });
  if (normalizedEmail) andClauses.push({ email: normalizedEmail });
  if (normalizedPhone) andClauses.push({ phone: normalizedPhone });
  andClauses.push({ channel: { in: channelFilters } });
  andClauses.push(
    data.category == null ? { category: null } : { OR: [{ category: null }, { category: data.category }] }
  );

  const existing = await prisma.communicationUnsubscribe.findFirst({
    where: { AND: andClauses as never }
  });

  if (existing) {
    return prisma.communicationUnsubscribe.update({
      where: { id: existing.id },
      data: {
        source: data.source,
        token: data.token || existing.token,
        unsubscribedAt: new Date()
      }
    });
  }

  return prisma.communicationUnsubscribe.create({
    data: {
      userId: data.userId || null,
      email: normalizedEmail,
      phone: normalizedPhone,
      channel: data.channel || 'all',
      category: data.category || null,
      token: data.token || null,
      source: data.source
    }
  });
}
