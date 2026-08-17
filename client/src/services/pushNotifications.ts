import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { api } from './api';
import { firebaseApp, isFirebaseConfigured } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim() || '';
const PUSH_OPT_OUT_KEY = 'metabolic-push-opt-out';

export function isPushOptedOutOnThisDevice() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(PUSH_OPT_OUT_KEY) === '1';
}

function setPushOptedOutOnThisDevice(optedOut: boolean) {
  if (typeof localStorage === 'undefined') return;
  if (optedOut) localStorage.setItem(PUSH_OPT_OUT_KEY, '1');
  else localStorage.removeItem(PUSH_OPT_OUT_KEY);
}

export type PushCapability = 'ready' | 'needs-pwa' | 'unsupported' | 'missing-config';

export function isPushConfigured() {
  return Boolean(isFirebaseConfigured && VAPID_KEY && firebaseApp);
}

export function isIosDevice(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /iPad|iPhone|iPod/i.test(userAgent);
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export async function getPushCapability(): Promise<PushCapability> {
  if (!isPushConfigured()) return 'missing-config';
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return isIosDevice() && !isStandaloneDisplay() ? 'needs-pwa' : 'unsupported';
  }
  if (await isSupported()) return 'ready';
  return isIosDevice() && !isStandaloneDisplay() ? 'needs-pwa' : 'unsupported';
}

export function currentPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

let swRegistration: ServiceWorkerRegistration | null = null;

async function ensureMessagingSw() {
  if (swRegistration) return swRegistration;
  swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  return swRegistration;
}

async function getMessagingIfSupported() {
  if (!firebaseApp || !(await isSupported())) return null;
  return getMessaging(firebaseApp);
}

export async function enablePushOnThisDevice() {
  const capability = await getPushCapability();
  if (capability === 'needs-pwa') {
    throw new Error(
      'On iPhone, add Metabolic to your Home Screen first, then open that icon and enable notifications.'
    );
  }
  if (capability !== 'ready') {
    throw new Error('Browser notifications are not available on this device.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications were blocked. Allow them in your browser settings, then try again.');
  }
  setPushOptedOutOnThisDevice(false);
  const messaging = await getMessagingIfSupported();
  if (!messaging) throw new Error('Browser notifications are not available on this device.');
  const registration = await ensureMessagingSw();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Could not create a notification token for this device.');
  await api('/api/push/devices', {
    method: 'POST',
    body: JSON.stringify({ token, userAgent: navigator.userAgent })
  });
  return token;
}

export async function disablePushOnThisDevice() {
  setPushOptedOutOnThisDevice(true);
  const messaging = await getMessagingIfSupported();
  if (!messaging) return;
  const registration = await ensureMessagingSw();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(
    () => null
  );
  if (token) {
    await api('/api/push/devices', { method: 'DELETE', body: JSON.stringify({ token }) }).catch(() => undefined);
  }
  await deleteToken(messaging).catch(() => undefined);
}

export async function syncPushTokenIfGranted() {
  if (isPushOptedOutOnThisDevice()) return;
  if (!isPushConfigured() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!(await isSupported())) return;
  try {
    const messaging = await getMessagingIfSupported();
    if (!messaging) return;
    const registration = await ensureMessagingSw();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return;
    await api('/api/push/devices', {
      method: 'POST',
      body: JSON.stringify({ token, userAgent: navigator.userAgent })
    });
  } catch {
    // Login should still succeed if FCM is misconfigured.
  }
}

export function listenForForegroundPush() {
  let unsubscribe = () => {};
  void (async () => {
    const messaging = await getMessagingIfSupported();
    if (!messaging) return;
    unsubscribe = onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || 'Metabolic';
      const body = payload.notification?.body || payload.data?.body || '';
      const url = payload.data?.url || '/';
      if (isPushOptedOutOnThisDevice()) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const notification = new Notification(title, { body, icon: '/logo.png' });
      notification.onclick = () => {
        window.focus();
        if (url.startsWith('/')) window.location.assign(url);
        notification.close();
      };
    });
  })();
  return () => unsubscribe();
}
