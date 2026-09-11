# iOS App – Master Metabolic

This document covers building, signing, and distributing the iOS app via Capacitor.

## App Store Connect Details

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| App Name       | Master Metabolic                       |
| Bundle ID      | `com.mastermetabolic.app`              |
| Apple ID (ASC) | `6810053439`                           |
| SKU            | `metabolicos`                          |
| Team           | Cliffs Mama, LLC                       |
| Team ID        | `8FG8V9P49A`                           |
| Capabilities   | Sign In with Apple, Push Notifications |

---

## Strategy: Bundled Assets

The iOS app bundles the Vite `dist/` build and signs in with **native** Google
and Sign in with Apple. That avoids Firebase `signInWithRedirect` inside WKWebView,
which fails with "missing initial state".

A remote `server.url` of `https://metabolic-v1.web.app` is only safe for social
login after that Hosting deploy includes the Capacitor authentication calls.

```bash
npm run cap:sync:ios
```

---

## Prerequisites (Mac)

- **macOS** with **Xcode 15+**
- **CocoaPods**: `brew install cocoapods` or `gem install cocoapods`
- **Node.js 18+**
- **Apple Developer Account** with access to Team `8FG8V9P49A`

---

## First-Time iOS Setup

Run the setup script from the `client/` directory on your Mac:

```bash
cd client
./scripts/ios-setup.sh
```

Or manually:

```bash
cd client
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

This generates the `ios/` directory with the Xcode project.

---

## Xcode Configuration

1. Open the project: `npx cap open ios` (or open `client/ios/App/App.xcworkspace`)

2. Select the **App** target in the project navigator

3. Under **Signing & Capabilities**:
   - **Team**: Cliffs Mama, LLC (`8FG8V9P49A`)
   - **Bundle Identifier**: `com.mastermetabolic.app`
   - Check **Automatically manage signing**

4. Under **General**:
   - **Display Name**: Master Metabolic
   - **Version**: Match web release (e.g., `1.0.0`)
   - **Build**: Increment for each TestFlight upload

---

## App Icons and Splash Screen

### Icons

Replace the placeholder icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.

Required sizes (1x, 2x, 3x for each use):
- 20pt: Notification icons
- 29pt: Settings icon
- 40pt: Spotlight
- 60pt: App icon
- 76pt: iPad icon
- 83.5pt: iPad Pro icon
- 1024pt: App Store icon (required)

**Tip**: Use a tool like [App Icon Generator](https://appicon.co/) with a 1024×1024 source PNG.

### Splash Screen

The splash screen is configured in `capacitor.config.ts`:
```ts
plugins: {
  SplashScreen: {
    launchShowDuration: 2000,
    backgroundColor: '#0f172a',
    // ...
  },
},
```

To use a custom splash image, edit `ios/App/App/Assets.xcassets/Splash.imageset/`.

---

## Building for TestFlight

### 1. Sync changes

After any web code changes:
```bash
cd client
npm run cap:sync:ios
```

### 2. Archive in Xcode

1. Select **Any iOS Device (arm64)** as the build target
2. **Product → Archive**
3. Wait for the archive to complete

### 3. Upload to App Store Connect

1. In the Organizer (Window → Organizer), select the archive
2. Click **Distribute App**
3. Choose **App Store Connect** → **Upload**
4. Ensure the app uploads to Apple ID `6810053439`
5. Wait for processing (usually 5–30 minutes)

### 4. Submit for Internal Testing

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select **Master Metabolic** (Apple ID: `6810053439`)
3. Navigate to **TestFlight** → **Internal Testing**
4. Add the build to an internal testing group
5. Testers receive an email invitation via TestFlight

---

## Smoke Test Plan

After installing from TestFlight:

| # | Test                                      | Expected Result                          |
|---|-------------------------------------------|------------------------------------------|
| 1 | App launches                              | Splash screen appears, then web app loads|
| 2 | Web app displays                          | metabolic-v1.web.app content visible     |
| 3 | Firebase Auth – Sign In with Apple        | Auth flow completes, user logged in      |
| 4 | Navigation works                          | Tap around; pages load without errors    |
| 5 | Network interruption (airplane mode)      | Graceful error (remote URL mode)         |
| 6 | Status bar / safe area                    | Content respects notch/home indicator    |
| 7 | Meal camera button                        | Permission prompt or camera; no crash    |
| 8 | Progress photo take / library             | Preview appears; app stays running       |

See `docs/app-store-ios.md` for the full camera TestFlight checklist.

---

## Common Issues

### "No matching provisioning profile"

- Ensure the bundle ID matches: `com.mastermetabolic.app`
- Check that your Apple ID has access to Team `8FG8V9P49A`
- In Xcode: Signing & Capabilities → disable then re-enable "Automatically manage signing"

### "Code signing is required"

- Open Xcode Preferences → Accounts → ensure your Apple ID is signed in
- Download manual provisioning profiles if needed from developer.apple.com

### "App Transport Security" errors

- The production URL uses HTTPS and should not trigger ATS
- If testing with a local URL, configure ATS exceptions in `Info.plist`

### Apple sign-in: AuthorizationError 1000

Sign in with Apple often fails in the **Simulator** with
`com.apple.AuthenticationServices.AuthorizationError error 1000`.

- Use a **physical iPhone**, or
- In the Simulator: **Settings → Sign in to your iPhone** with an Apple ID that
  has two-factor authentication

Also confirm Xcode **Signing & Capabilities** includes **Sign in with Apple**
for the App target (`com.mastermetabolic.app`).

### Google sign-in returns to the login screen

The iOS Google ID token is often issued for the **iOS** OAuth client, while
Firebase JS Auth expects the **web** client. Native sign-in also backgrounds
the WebView, which can drop the JS promise.

`SERVER_CLIENT_ID` in `native/GoogleService-Info.plist` must be the Firebase
**web** OAuth client ID. Native Auth must use `initializeAuth` with
`indexedDBLocalPersistence` — `getAuth()` can hang after Google returns.
Pending tokens are stored and exchanged with an access-token fallback. The iOS
WebView origin is `https://metaos.mastermetabolic.com` so it matches the
production site. The API stays on Cloud Run (`VITE_API_URL`) and must allow
that origin in CORS.

After changing native auth files:

```bash
cd client
npm run cap:sync:ios
```

Then **Product → Run** in Xcode (a sync alone does not relaunch the simulator app).

### Camera opens and the app immediately closes

iOS kills the process if `NSCameraUsageDescription` is missing from `Info.plist`. Capacitor does not write that key from `capacitor.config.ts`. After `npm run cap:sync:ios`, confirm the three privacy keys in `ios/App/App/Info.plist` (merged from `native/ios-privacy-usage.json`). Meal and progress photos must go through `@capacitor/camera`, not a web file input.

### CocoaPods errors

```bash
cd ios/App
pod repo update
pod install
```

---

## Updating After Web Changes

```bash
cd client
npm run cap:sync:ios
# Open Xcode and rebuild/archive
```

If using remote URL mode, web changes deploy automatically to Firebase Hosting;
the iOS app fetches them on next launch. No app update needed.

---

## Switching to Bundled Mode

To ship built assets instead of loading the remote URL:

1. Edit `client/capacitor.config.ts`:
   ```ts
   // Comment out the server block:
   // server: {
   //   url: 'https://metabolic-v1.web.app',
   //   cleartext: false,
   // },
   ```

2. Rebuild and sync:
   ```bash
   npm run cap:sync:ios
   ```

3. Archive and upload a new TestFlight build

---

## Resources

- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [TestFlight Documentation](https://developer.apple.com/testflight/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/ios)
