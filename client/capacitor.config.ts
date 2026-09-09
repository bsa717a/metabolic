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
    // Allow OAuth flows to stay inside the WebView instead of opening Safari
    allowNavigation: [
      'metabolic-v1.firebaseapp.com',
      '*.firebaseapp.com',
      'appleid.apple.com',
      'accounts.google.com',
    ],
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

  plugins: {},
};

export default config;
