const STATIC_CLIENT_ORIGINS = [
  'https://metaos.mastermetabolic.com',
  'https://www.metaos.mastermetabolic.com',
  // WKWebView cannot register `https` as a custom scheme, so Capacitor falls
  // back to `capacitor://` even when capacitor.config sets iosScheme: https.
  'capacitor://metaos.mastermetabolic.com',
  'https://metabolic-v1.web.app',
  'https://metabolic-v1.firebaseapp.com',
  'http://localhost:5173',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost'
];

export function corsAllowedOrigins(clientUrl: string): string[] {
  const origins = new Set<string>(STATIC_CLIENT_ORIGINS);
  try {
    origins.add(new URL(clientUrl).origin);
  } catch {
    const trimmed = clientUrl.replace(/\/$/, '');
    if (trimmed) origins.add(trimmed);
  }
  return [...origins];
}
