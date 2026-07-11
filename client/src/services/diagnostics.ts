/**
 * Client diagnostics ring buffers for the beta feedback widget. Everything here is
 * whitelist-only and assembled at submit time — never request/response bodies, headers,
 * or tokens. The server re-strips via sanitizeDiagnostics as defense in depth.
 */

const MAX_FAILED_REQUESTS = 10;
const MAX_CLIENT_ERRORS = 10;
const MAX_NAV_TRAIL = 15;

export type FailedRequest = { method: string; path: string; status: number; at: string };
export type ClientErrorEntry = { message: string; source: string | null; at: string };
export type NavEntry = { pathname: string; at: string };

const failedRequests: FailedRequest[] = [];
const clientErrors: ClientErrorEntry[] = [];
const navTrail: NavEntry[] = [];

function push<T>(buffer: T[], entry: T, max: number) {
  buffer.push(entry);
  if (buffer.length > max) buffer.shift();
}

function nowIso() {
  return new Date().toISOString();
}

/** Record a non-2xx API response. Only method + path + status — never the body. */
export function recordFailedRequest(method: string, path: string, status: number) {
  // Drop query strings so we never capture params that might carry sensitive values.
  const cleanPath = path.split('?')[0];
  push(failedRequests, { method, path: cleanPath, status, at: nowIso() }, MAX_FAILED_REQUESTS);
}

export function recordClientError(message: string, source: string | null) {
  push(clientErrors, { message: message.slice(0, 500), source, at: nowIso() }, MAX_CLIENT_ERRORS);
}

export function recordNavigation(pathname: string) {
  const last = navTrail[navTrail.length - 1];
  if (last?.pathname === pathname) return;
  push(navTrail, { pathname, at: nowIso() }, MAX_NAV_TRAIL);
}

/** Registers global error listeners. Call once at app startup. */
export function installGlobalErrorCapture() {
  window.addEventListener('error', (event) => {
    const source = event.filename ? `${event.filename}:${event.lineno ?? ''}` : null;
    recordClientError(event.message || String(event.error ?? 'Unknown error'), source);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection');
    recordClientError(message, 'unhandledrejection');
  });
}

function resolveTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

function parseUserAgent(ua: string) {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Unknown';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /(iPhone|iPad|iPod)/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown';
  const deviceType = /(iPad|Tablet)/.test(ua)
    ? 'tablet'
    : /(iPhone|iPod|Android.*Mobile|Mobile)/.test(ua)
      ? 'mobile'
      : 'desktop';
  return { browser, os, deviceType };
}

export type SelectedRecord = { type: string; id: string; label?: string };

export type Diagnostics = {
  browser: string;
  os: string;
  deviceType: string;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
  timezone: string;
  appVersion: string;
  featureFlags: string[];
  navTrail: NavEntry[];
  clientErrors: ClientErrorEntry[];
  failedRequests: FailedRequest[];
  selectedRecord: SelectedRecord | null;
};

/** Assembles the full diagnostics snapshot at submit time. */
export function collectDiagnostics(input: {
  featureFlags: string[];
  selectedRecord?: SelectedRecord | null;
}): Diagnostics {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const { browser, os, deviceType } = parseUserAgent(ua);

  return {
    browser,
    os,
    deviceType,
    screen: { width: window.screen?.width ?? 0, height: window.screen?.height ?? 0 },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    timezone: resolveTimezone(),
    appVersion: __APP_VERSION__,
    featureFlags: input.featureFlags,
    navTrail: [...navTrail],
    clientErrors: [...clientErrors],
    failedRequests: [...failedRequests],
    selectedRecord: input.selectedRecord ?? null
  };
}
