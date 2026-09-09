import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mastermetabolic.app',
  appName: 'Master Metabolic',
  webDir: 'dist',

  // For first TestFlight "hello world": load production web app in WebView.
  // Comment out this server block to use the local bundled dist/ instead.
  server: {
    url: 'https://metabolic-v1.web.app',
    cleartext: false, // HTTPS only
  },

  ios: {
    // Matches Apple Team ID in App Store Connect
    // Team: Cliffs Mama, LLC (8FG8V9P49A)
    // Signing configured in Xcode via Automatically manage signing
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
