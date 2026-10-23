#!/bin/bash
# Copy native auth files that Capacitor / CocoaPods would otherwise miss.
# The Google Sign-In handler must request an ID token for the Firebase web
# client (SERVER_CLIENT_ID), or JS Auth rejects the credential and login
# returns to the sign-in screen.
#
# Android handlers are patched copies. Google still requests the Firebase web
# client (default_web_client_id from google-services.json, which is not
# committed) and writes the same pending-token handoff as iOS. Apple keeps the
# raw nonce for the JS SDK and does not leave a native Firebase session when
# skipNativeAuth is set. google-services.json stays gitignored.
set -euo pipefail

cd "$(dirname "$0")/.."

ROOT="$(cd .. && pwd)"
PLUGIN_HANDLERS="$ROOT/node_modules/@capacitor-firebase/authentication/ios/Plugin/Handlers"

if [[ ! -d "$PLUGIN_HANDLERS" ]]; then
  echo "Plugin handlers not found (is @capacitor-firebase/authentication installed?)" >&2
  exit 1
fi

for handler in GoogleAuthProviderHandler.swift AppleAuthProviderHandler.swift; do
  src="native/$handler"
  dest="$PLUGIN_HANDLERS/$handler"
  if [[ ! -f "$src" ]]; then
    echo "Missing $src" >&2
    exit 1
  fi
  cp "$src" "$dest"
  echo "Patched $handler → $dest"
done

ANDROID_HANDLERS="$ROOT/node_modules/@capacitor-firebase/authentication/android/src/main/java/io/capawesome/capacitorjs/plugins/firebase/authentication/handlers"
if [[ -d "$ANDROID_HANDLERS" ]]; then
  for handler in GoogleAuthProviderHandler.java AppleAuthProviderHandler.java OAuthProviderHandler.java; do
    src="native/android/$handler"
    dest="$ANDROID_HANDLERS/$handler"
    if [[ ! -f "$src" ]]; then
      echo "Missing $src" >&2
      exit 1
    fi
    cp "$src" "$dest"
    echo "Patched $handler → $dest"
  done
fi

if [[ -d ios/App/App ]]; then
  cp native/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
  cp native/App.entitlements ios/App/App/App.entitlements
  cp native/SceneDelegate.swift ios/App/App/SceneDelegate.swift
  echo "Copied GoogleService-Info.plist, App.entitlements, and SceneDelegate into ios/App/App"
fi

# Capacitor does not write ios.infoPlist from capacitor.config.ts. Merge the
# camera / photo usage strings or iOS kills the app when the camera opens.
node scripts/apply-ios-privacy-plist.mjs
