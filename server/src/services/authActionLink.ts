/** Path in the Metabolic web app that handles Firebase email action codes. */
export const AUTH_ACTION_PATH = '/auth/action';

/**
 * Firebase verification/reset emails always point at the hosted
 * `https://<project>.firebaseapp.com/__/auth/action` page. Rewrite that link
 * onto the Metabolic app so the user never sees the generic Firebase UI.
 */
export function toAppAuthActionLink(
  firebaseActionUrl: string,
  clientUrl: string,
  continuePath = '/login'
): string {
  const source = new URL(firebaseActionUrl);
  const mode = source.searchParams.get('mode');
  const oobCode = source.searchParams.get('oobCode');
  if (!mode || !oobCode) {
    throw new Error('Firebase action link is missing mode or oobCode.');
  }

  const origin = clientUrl.replace(/\/$/, '');
  const dest = new URL(`${origin}${AUTH_ACTION_PATH}`);
  dest.searchParams.set('mode', mode);
  dest.searchParams.set('oobCode', oobCode);

  const apiKey = source.searchParams.get('apiKey');
  if (apiKey) dest.searchParams.set('apiKey', apiKey);
  const lang = source.searchParams.get('lang');
  if (lang) dest.searchParams.set('lang', lang);

  dest.searchParams.set('continueUrl', `${origin}${continuePath.startsWith('/') ? continuePath : `/${continuePath}`}`);
  return dest.toString();
}
