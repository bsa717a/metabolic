import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Build stamp for feedback diagnostics. CI passes VITE_GIT_SHA (e.g. Cloud Build $SHORT_SHA); 'dev' locally.
const appVersion = process.env.VITE_GIT_SHA || 'dev';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  plugins: [react(), tailwindcss()]
});
