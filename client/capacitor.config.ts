/// <reference types="@capacitor-firebase/authentication" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mastermetabolic.app',
  appName: 'Master Metabolic',
  webDir: 'dist',
  // Matches --app-bg (classic). Avoids a black flash in the iOS safe-area gutters
  // before CSS paints. Dark theme still paints over this from html/body.
  backgroundColor: '#e9ecef',

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
    //
    // `automatic` insets the WKWebView scroll view, which rubber-bands the
    // entire shell (including the tab bar) and leaves a black gutter under
    // the status bar. `never` + viewport-fit=cover + CSS env(safe-area-inset-*)
    // draws edge-to-edge and lets the web chrome honor the insets.
    contentInset: 'never',
    backgroundColor: '#e9ecef',
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
    scrollEnabled: true,

    // Camera / photo privacy strings are NOT read from this file. Capacitor
    // does not apply `ios.infoPlist`. `native:patch` merges
    // native/ios-privacy-usage.json into ios/App/App/Info.plist.

    // Associated Domains entitlement for Universal Links (deep links from web to app).
    // Capacitor syncs these to the App.entitlements file during `cap sync`.
    // See docs/app-store-ios.md for manual Xcode verification steps.
    appendLinkedDomains: [
      'applinks:metaos.mastermetabolic.com',
      'applinks:metabolic-v1.web.app',
    ],
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
