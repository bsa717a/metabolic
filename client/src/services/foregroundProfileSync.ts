/**
 * Foreground profile refresh. `/api/me` and Apple restore both return a full
 * user. Apply the profile first, then the Apple user, and drop the result if a
 * newer refresh started while this one was in flight.
 */
export async function applyForegroundProfileSync<T>(input: {
  generation: number;
  isCurrent: (generation: number) => boolean;
  loadMe: () => Promise<T | null>;
  syncApple: () => Promise<T | null>;
  apply: (user: T) => void;
}): Promise<void> {
  const me = await input.loadMe();
  if (!input.isCurrent(input.generation)) return;
  if (me) input.apply(me);

  const appleUser = await input.syncApple();
  if (!input.isCurrent(input.generation)) return;
  if (appleUser) input.apply(appleUser);
}
