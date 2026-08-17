import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function jsString(value: string | undefined) {
  return JSON.stringify(value || '');
}

function buildFirebaseMessagingSw(env: Record<string, string>) {
  return `/* Generated — do not edit. */
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: ${jsString(env.VITE_FIREBASE_API_KEY)},
  authDomain: ${jsString(env.VITE_FIREBASE_AUTH_DOMAIN)},
  projectId: ${jsString(env.VITE_FIREBASE_PROJECT_ID || 'metabolic-v1')},
  storageBucket: ${jsString(env.VITE_FIREBASE_STORAGE_BUCKET)},
  messagingSenderId: ${jsString(env.VITE_FIREBASE_MESSAGING_SENDER_ID)},
  appId: ${jsString(env.VITE_FIREBASE_APP_ID)}
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const title = payload.data?.title || 'Metabolic';
  const body = payload.data?.body || '';
  const url = payload.data?.url || '/';
  return self.registration.showNotification(title, {
    body,
    icon: '/logo.png',
    data: { url }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client && typeof target === 'string') {
          await client.navigate(target);
        }
        return;
      }
    }
    await clients.openWindow(target);
  })());
});
`;
}

function firebaseMessagingSwPlugin(env: Record<string, string>): Plugin {
  const source = buildFirebaseMessagingSw(env);
  return {
    name: 'firebase-messaging-sw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/firebase-messaging-sw.js') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Service-Worker-Allowed', '/');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(source);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'firebase-messaging-sw.js', source });
    }
  };
}

// Build stamp for feedback diagnostics. CI passes VITE_GIT_SHA (e.g. Cloud Build $SHORT_SHA); 'dev' locally.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const appVersion = process.env.VITE_GIT_SHA || 'dev';

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    plugins: [react(), tailwindcss(), firebaseMessagingSwPlugin(env)]
  };
});
