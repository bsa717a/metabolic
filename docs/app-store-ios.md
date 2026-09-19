# App Store iOS – Master Metabolic

This document covers remaining steps for App Store submission, TestFlight distribution, and push notifications setup.

## App Store Connect Details

| Field          | Value                          |
| -------------- | ------------------------------ |
| App Name       | Master Metabolic               |
| Bundle ID      | `com.mastermetabolic.app`      |
| Apple ID (ASC) | `6810053439`                   |
| SKU            | `metabolicos`                  |
| Team           | Cliffs Mama, LLC               |
| Team ID        | `8FG8V9P49A`                   |

---

## iOS Setup Checklist

Run the setup script on a Mac:

```bash
cd client
./scripts/ios-setup.sh
```

This generates `ios/` and syncs the Capacitor config. Verify the following in Xcode:

### 1. Signing & Capabilities

1. Open Xcode: `npx cap open ios`
2. Select the **App** target
3. Under **Signing & Capabilities**:
   - **Team**: Cliffs Mama, LLC (`8FG8V9P49A`)
   - **Bundle Identifier**: `com.mastermetabolic.app`
   - Check **Automatically manage signing**

### 2. Associated Domains (Universal Links)

Verify the Associated Domains capability is present with these domains:

```
applinks:metaos.mastermetabolic.com
applinks:metabolic-v1.web.app
```

If missing, add the capability manually:
1. Click **+ Capability** in Signing & Capabilities
2. Select **Associated Domains**
3. Add the domains listed above

**AASA Verification**: After deploying to Firebase Hosting, verify the AASA file:

```bash
curl -I https://metabolic-v1.web.app/.well-known/apple-app-site-association
# Should return Content-Type: application/json

curl https://metabolic-v1.web.app/.well-known/apple-app-site-association | jq .
# Should show the applinks configuration
```

Apple also provides a [validation tool](https://search.developer.apple.com/appsearch-validation-tool/).

### 3. Info.plist Privacy Descriptions

Capacitor does **not** copy usage strings from `capacitor.config.ts`. `npm run native:patch` (part of `cap:sync:ios`) merges `client/native/ios-privacy-usage.json` into `ios/App/App/Info.plist`.

Verify these keys exist in `ios/App/App/Info.plist` after sync:

| Key                              | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `NSCameraUsageDescription`       | Camera access for progress/meal photos       |
| `NSPhotoLibraryUsageDescription` | Photo library access for uploading images    |
| `NSPhotoLibraryAddUsageDescription` | Saving photos to user's library           |

If missing, re-run `npm run native:patch` from `client/`, or add them in Xcode under the **Info** tab. Without `NSCameraUsageDescription`, iOS terminates the app as soon as the camera opens.

---

## Universal Links – Deep Link Paths

The app supports these deep link paths:

| Path                   | Description                          | Example                                                     |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `/join?coach=CODE`     | Coach invite link                    | `https://metaos.mastermetabolic.com/join?coach=ABC123`      |
| `/join?code=CODE`      | Coach invite link (alternate param)  | `https://metabolic-v1.web.app/join?code=ABC123`             |

When tapped on iOS with the app installed, these links open directly in the app instead of Safari.

---

## Push Notifications Setup (APNs)

Push notifications require additional Apple Developer Console configuration.

### Prerequisites

- Access to the [Apple Developer Console](https://developer.apple.com) with Team `8FG8V9P49A`
- Access to the [Firebase Console](https://console.firebase.google.com) for the Metabolic project

### Step 1: Create APNs Key in Apple Developer Console

1. Go to **Certificates, Identifiers & Profiles** → **Keys**
2. Click **+** to create a new key
3. Name: `Master Metabolic APNs`
4. Check **Apple Push Notifications service (APNs)**
5. Click **Continue** → **Register**
6. **Download the .p8 file** (you can only download once!)
7. Note the **Key ID** (10-character string)

### Step 2: Upload APNs Key to Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) → **Metabolic** project
2. Navigate to **Project Settings** → **Cloud Messaging** tab
3. Under **Apple app configuration**, click **Upload** for APNs Authentication Key
4. Upload the `.p8` file from Step 1
5. Enter the **Key ID** and **Team ID** (`8FG8V9P49A`)

### Step 3: Add Push Capability in Xcode

1. Open Xcode: `npx cap open ios`
2. Select the **App** target
3. Go to **Signing & Capabilities**
4. Click **+ Capability**
5. Add **Push Notifications**
6. Add **Background Modes** and check **Remote notifications**

### Step 4: Install Capacitor Push Plugin (Optional)

For native push handling beyond FCM web:

```bash
cd client
npm install @capacitor/push-notifications
npx cap sync ios
```

Then wire up in the app. For now, the web app uses Firebase Cloud Messaging (FCM) for web push, which continues to work in the WebView.

---

## TestFlight – camera smoke test

Meal and progress photos use `@capacitor/camera` inside the iOS shell (not the web `<input type="file">` / `getUserMedia` path). After uploading a build that includes this native plugin + Info.plist keys:

1. Install the new TestFlight build (a JS-only Hosting deploy is not enough).
2. Sign in and open **Today**.
3. Tap the camera button on the meal logger.
4. Confirm iOS shows the system camera/library prompt (or the in-plugin Take photo / Photo library sheet) and the app does **not** crash.
5. Allow Camera. Take a meal photo. Confirm the preview appears and logging still works.
6. Open a progress-photo upload (baseline / weekly check-in). Take a photo and pick one from the library. Confirm previews appear.
7. Optional: Settings → Master Metabolic → disable Camera, then tap the camera button again. Expect a Settings guidance message, not a crash.
8. Safari on the website should still use the file picker (unchanged).

---

## TestFlight – iOS safe-area / over-scroll smoke test

Use a **new TestFlight build** after `npm run cap:sync:ios` (a Hosting-only deploy does not update the native shell). Do **not** replace the App Review 1.0 (3) binary that is Waiting for Review.

Install on a notched / Dynamic Island iPhone (or the matching simulator).

1. **Top safe area.** Open Home. Confirm the app background fills under the status bar / Dynamic Island. There must be no black gutter. Header text and the logo sit below the inset.
2. **Home indicator.** Confirm the five tab labels sit fully above the home indicator. The tab bar surface fills the bottom inset. Labels are not clipped or overlapped.
3. **Over-scroll top.** On a long page (Nutrition or Progress), flick down from the top. The WKWebView must **not** rubber-band as a whole. The bottom nav stays pinned; no black strip appears under the tab bar.
4. **Over-scroll bottom.** Flick up past the end of the same page. Same expectation: chrome stays put.
5. **Mid-page scroll.** Normal scrolling in the middle of the page still works.
6. **Safari / web.** The same routes in Safari should look unchanged (safe-area CSS is a no-op when insets are 0).

Hold merge until Derek confirms this smoke on TestFlight.

---

## TestFlight – workout countdown audio / haptics smoke test

Use a **new TestFlight build** after `npm run cap:sync:ios` (a Hosting-only deploy does not update `SceneDelegate` or `@capacitor/haptics`). Do **not** replace the App Review 1.0 (3) binary that is Waiting for Review.

Need a day with a planned exercise that has rest between sets (or a timed duration) so the 5 → 3-2-1 + recorded Go path fires.

1. **Silent switch ON, no other audio.** Start a workout. Confirm a beep at **5**, **no beep at 4**, then beeps at **3, 2, 1**. At zero, confirm the recorded **“Go!”** clip (natural voice file — not robot TTS). Cues should be near max volume, not harsh/clipped. Light haptic on each tick; stronger haptic on GO.
2. **Silent switch OFF, no other audio.** Same: 5 → 3-2-1, recorded Go, loud but not harsh; same haptics.
3. **Other audio playing.** Start Apple Music / Spotify / a podcast, then run the countdown. Beeps and recorded Go should mix (other audio must not pause). If cues are lost under loud music, note it — we can add `.duckOthers` in a follow-up.
4. **In-app mute toggle.** Mute in the session header. Confirm beeps and recorded Go stop. Unmute and confirm they return. Haptics still fire while muted.
5. **Background / resume.** Start a rest timer, background the app for a few seconds, then return before and after GO. After foregrounding, the next countdown must beep and the next Go clip must play (AudioContext / HTMLAudio re-prime). Missed ticks while backgrounded are skipped; GO should still fire when the timer elapses.
6. **Safari / web.** Same session in Safari: louder beeps + recorded Go are OK; native haptics are a no-op (`navigator.vibrate` may pulse on Android/web).

Hold merge until Derek confirms this smoke on TestFlight. Meta cuts a new TestFlight after merge + Derek yes. This branch does not archive or upload.

---

## TestFlight – Music mix, keep-awake, orientation smoke test

Use a **new TestFlight build** after `npm run cap:sync:ios` (Hosting-only does not update `SceneDelegate`, `@capacitor-community/keep-awake`, or `@capacitor/screen-orientation`). Do **not** replace the App Review 1.0 (5) binary.

Need a day with rest between sets (or a timed duration) so the 5 → 3-2-1 + recorded Go path fires.

1. **Apple Music + cues.** Start Music, then start a workout. Music must **keep playing**. Hear beeps at **5**, then **3, 2, 1** (no beep at 4), then the recorded **“Go!”** clip. Cues mix with Music; Music must not pause or stop.
2. **Silent switch ON.** Same countdown with the Silent switch on and no other audio. Beeps + Go still play (prior #291 path). Light haptic on ticks; stronger haptic on Go.
3. **Keep-awake.** On Nutrition, leave the phone idle — the screen must stay on. During an **active** workout, same. Leave Nutrition / end the workout (summary or back to Today) — the phone may dim/sleep again.
4. **Orientation.** In an active workout, rotate the device — UI stays **portrait** and controls stay visible. Leave the session / end workout — rotation unlocks.

Hold merge until Derek confirms this smoke on TestFlight. This branch does not archive, upload, or replace the App Review binary.

---

## Local smoke – Apple Music uninterrupted by workout cues

Post-#294 on TF 1.0 (6): countdown beeps, recorded Go, and orientation lock work, but **Apple Music still stops / pauses** when ticks + Go fire. WKWebView HTMLAudio / Web Audio run in a separate process and take exclusive playback, so SceneDelegate `.mixWithOthers` never applied to those cues.

This branch plays ticks + Go with **in-process `AVAudioPlayer`** (`.playback` + `.mixWithOthers`, never deactivate). Derek smokes **locally** after `npm run cap:sync:ios` on a Mac. **Local smoke only** — do **not** archive or upload a TestFlight for this follow-up. Do **not** merge until Derek yes. App Review / ASC binary **1.0 (5)** is untouched.

Need a day with rest between sets (or a timed duration) so the 5 → 3-2-1 + recorded Go path fires.

1. Start **Apple Music**, then start a workout countdown. Music **keeps playing** through 5, 3, 2, 1 + Go (must not pause or stop).
2. Beeps + recorded Go are still **audible** over Music.
3. Silent switch **ON** still plays cues (prior #291 / #294 fix).
4. Orientation lock during the session still works (prior #294). Keep-awake was not changed.

---

## TestFlight Upload

### 1. Sync Changes

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

## App Icons

Replace the placeholder icons in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.

Required sizes:
- 20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt (at 1x, 2x, 3x scales)
- 1024pt App Store icon (required)

Use [App Icon Generator](https://appicon.co/) with a 1024×1024 source PNG.

---

## Quick Reference Commands

```bash
# Initial iOS setup (run once on Mac)
cd client && ./scripts/ios-setup.sh

# Sync after web changes
cd client && npm run cap:sync:ios

# Open in Xcode
cd client && npx cap open ios

# Verify AASA after deploy
curl https://metabolic-v1.web.app/.well-known/apple-app-site-association | jq .
```

---

## Resources

- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [Apple Universal Links Documentation](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content)
- [Firebase Cloud Messaging iOS Setup](https://firebase.google.com/docs/cloud-messaging/ios/client)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
