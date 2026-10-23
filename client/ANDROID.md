# Android App – Firebase Auth (Google and Apple)

This slice wires Google and Apple sign-in on the Capacitor Android shell so they finish in the same Firebase JS session as iOS and web. Workout session cues are a native plugin, described under Session cues. This document does not add Play Billing or a Play workflow.

The web bundle already calls `loginWithGoogle` / `loginWithApple`. On Android those calls use `@capacitor-firebase/authentication` with `skipNativeAuth: true`, then `signInWithCredential` in the JS SDK. Google requests an ID token for the Firebase **web** client (`default_web_client_id`). Apple uses Firebase `OAuthProvider` (there is no iOS-style `ASAuthorizationController` on Android), returns the Apple ID token and raw nonce, and signs the native Firebase user out so the WebView session is the one the app reads.

`npm run cap:sync:android` from `client/` applies `scripts/apply-native-auth-patches.sh` before the build. That copies `client/native/android/*.java` over the plugin handlers. Do not commit the patched `node_modules` copies.

Nothing in this list is a keystore. Do not commit `google-services.json`, a `.jks`, a `.keystore`, an Apple `.p8`, or a real SHA fingerprint.

## What Derek or Meta must supply

Put `google-services.json` at `client/android/app/google-services.json`. `client/android/.gitignore` already ignores that filename. Download it **after** the Android app and the SHA fingerprints below are saved in Firebase. Downloading earlier omits the Android OAuth client, and Google sign-in cannot mint an ID token.

| Item | Value | Status |
| --- | --- | --- |
| File path | `client/android/app/google-services.json` | Known path. The file itself is **not in git**. |
| Firebase project | `metabolic-v1` | Known |
| Android package | `com.mastermetabolic.app` | Known. Must match `applicationId`. |
| Firebase Android app id (`mobilesdk_app_id`) | — | **UNKNOWN** until the Android app exists in Firebase and the JSON is downloaded |
| Android API key inside `google-services.json` | — | **UNKNOWN**. Leave it inside the gitignored file. Do not paste it into the repo. |
| Web OAuth client (`oauth_client` `client_type` 3, becomes `default_web_client_id`) | `707557008901-utr23g550vsjatn2g2fv112uq9daf7pr.apps.googleusercontent.com` | Known. This is the same Firebase web client as iOS `SERVER_CLIENT_ID`. JS Auth rejects a Google ID token for any other audience. Confirm the downloaded JSON contains this client. |
| Android OAuth client (`oauth_client` `client_type` 1) | — | **UNKNOWN** until package name plus SHA-1 are registered and the JSON is downloaded again |

If `default_web_client_id` is still the plugin placeholder `WILL_BE_OVERRIDDEN`, Google sign-in stops with a configuration error instead of sending a token.

### SHA-1 and SHA-256

Add every fingerprint that will sign a build to the Firebase Android app (Project settings → Your apps → Android → Add fingerprint), then re-download `google-services.json`. Play App Signing and the upload key are different certs. Debug is a third cert. Firebase needs the cert of the build you actually run.

| Fingerprint | Value | Status |
| --- | --- | --- |
| Debug keystore SHA-1 | — | **UNKNOWN**. Created on the machine that first builds. Not in this repo. |
| Debug keystore SHA-256 | — | **UNKNOWN** |
| Play upload key SHA-1 | — | **UNKNOWN** |
| Play upload key SHA-256 | — | **UNKNOWN** |
| Play app-signing SHA-1 | — | **UNKNOWN** |
| Play app-signing SHA-256 | — | **UNKNOWN**. `client/public/.well-known/assetlinks.json` still has the placeholder `PLACEHOLDER_PLAY_APP_SIGNING_SHA256`. That string is not a certificate fingerprint. |

Read the debug cert only after a local build, and do not commit the output:

```bash
cd client/android
./gradlew signingReport
```

Play Console → Test and release → App integrity → App signing shows the Play app-signing and upload certificates. Copy those into Firebase. Do not invent a fingerprint and do not put one in git.

### Firebase console

| Setting | Value | Status |
| --- | --- | --- |
| Authentication → Google | Enabled for this project (already required for web and iOS) | Confirm. No new client secret is known. |
| Authentication → Apple → Services ID | — | **UNKNOWN** in this repo. Web sign-in already needs one. Use that same Services ID if it is the one configured for `metabolic-v1`. |
| Authentication → Apple → Team ID | `8FG8V9P49A` (Cliffs Mama, LLC) | Known |
| Authentication → Apple → Key ID | — | **UNKNOWN**. Do not assume the App Store Connect API key `2H9BZ26296` is the Sign in with Apple key. Those are different keys unless Derek confirms otherwise. |
| Authentication → Apple → private key (`.p8`) | — | **UNKNOWN** whether it is already pasted into Firebase. Do not commit the `.p8`. |
| Authorized domain | `metabolic-v1.firebaseapp.com` | Known. Required for the Apple redirect. Confirm it is listed. |
| OAuth consent screen | Existing `metabolic-v1` screen used by web and iOS | No new value is known. The Android OAuth client should appear in that same Google Cloud project after the SHA-1 is added. |

### Apple Developer (Android uses the web OAuth flow)

| Setting | Value | Status |
| --- | --- | --- |
| App ID | `com.mastermetabolic.app` with Sign in with Apple | Known. Already used by the iOS app. |
| Services ID (Apple OAuth client id) | — | **UNKNOWN** |
| Services ID domain | `metabolic-v1.firebaseapp.com` | Known. Confirm it is registered on that Services ID. |
| Return URL | `https://metabolic-v1.firebaseapp.com/__/auth/handler` | Known. Same URL the web app uses. Confirm it is registered. Android has no extra return URL in this repo. |
| Sign in with Apple key id | — | **UNKNOWN** |
| Sign in with Apple private key | — | **UNKNOWN**. Do not commit it. |

No Android-specific Apple capability, bundle id, or Services ID is recorded in the repo beyond the shared Firebase handler above.

## After the file is in place

```bash
cd client
npm run cap:sync:android
npm run cap:open:android
```

The sync builds `dist/` with the same `VITE_FIREBASE_*` values the iOS shell uses. No new web env var is known for Android auth.

Sign-in to verify, once the unknown rows above are filled:

| Check | Expected |
| --- | --- |
| Google | Account picker, then the JS session is the same Firebase user as web. A WebView reload still finishes from the pending Google token. |
| Apple | Apple page in a custom tab, then the JS session is signed in with the Apple ID token and raw nonce. The native Firebase user is signed out afterward. |
| Missing `google-services.json` | Gradle skips the Google services plugin. Google and Apple sign-in cannot run. |

Email and password stay on the Firebase JS SDK. This document does not change that, and it does not change the iOS handlers.

## Session cues

Android plays the workout tick, Go, and Stop in the app process through the `SessionCues` Capacitor plugin. iOS does the same with `AVAudioPlayer`. The web layer already calls that plugin on every native platform, so Android did not need a separate JavaScript path.

`AudioTrack` uses the media stream and does not request audio focus. A cue mixes under Spotify or another music app instead of pausing it. That is the v1 port of iOS `.playback` + `.mixWithOthers` without asking other apps to lower their volume. The recorded clips in `android/app/src/main/res/raw` are the same files as `public/audio`. If a clip is missing, the plugin synthesizes the iOS sine motif (880 Hz tick, 1175 Hz Go, 220 Hz Stop).

Hiding the mute control was the fallback if that mix could not be done faithfully. The iOS feature is four plugin methods and a short PCM player, so the port is what ships. The mute control stays on Android because the cues are real. Play Billing is still not part of this work.
