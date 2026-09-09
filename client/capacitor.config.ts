/// <reference types="@capacitor-firebase/authentication" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mastermetabolic.app',
  appName: 'Master Metabolic',
  webDir: 'dist',

  // Bundle dist/ so Google/Apple use native SDKs. A remote Hosting URL only
  // works for social login after that same JS is deployed and this native shell
  // includes the Capacitor Firebase Authentication plugin.
  //
  // Bundled dist/. WKWebView cannot use `https` as a custom scheme, so the
  // real origin is capacitor://metaos.mastermetabolic.com. API calls use
  // Capacitor native HTTP so they are not blocked by CORS.
  server: {
    hostname: 'metaos.mastermetabolic.com',
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
    CapacitorHttp: {
      enabled: true
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['apple.com', 'google.com']
    }
  },
};

export default config;
