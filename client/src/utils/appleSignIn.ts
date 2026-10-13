type AppleName = {
  firstName?: string;
  lastName?: string;
  givenName?: string;
  familyName?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fullName(first: string | undefined, last: string | undefined) {
  return `${first ?? ''} ${last ?? ''}`.trim();
}

function nameFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (!isRecord(value)) return null;
  const named = value as AppleName;
  return (
    fullName(named.firstName ?? named.givenName, named.lastName ?? named.familyName) || null
  );
}

/** Apple only sends the user's name on the first authorization. */
export function displayNameFromAppleResult(result: {
  user: { displayName: string | null };
  additionalUserInfo?: { profile?: Record<string, unknown> | null } | null;
}): string | null {
  const existing = result.user.displayName?.trim();
  if (existing) return existing;

  const profile = result.additionalUserInfo?.profile;
  if (!profile) return null;

  return (
    nameFromUnknown(profile.name) ||
    fullName(
      typeof profile.givenName === 'string' ? profile.givenName : undefined,
      typeof profile.familyName === 'string' ? profile.familyName : undefined
    ) ||
    null
  );
}

export function isAppleUserCredential(result: {
  providerId?: string | null;
  user: { providerData: Array<{ providerId: string }> };
}): boolean {
  return (
    result.providerId === 'apple.com' ||
    result.user.providerData.some((provider) => provider.providerId === 'apple.com')
  );
}
