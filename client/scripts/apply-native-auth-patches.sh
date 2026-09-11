#!/bin/bash
# Copy native auth files that Capacitor / CocoaPods would otherwise miss.
# The Google Sign-In handler must request an ID token for the Firebase web
# client (SERVER_CLIENT_ID), or JS Auth rejects the credential and login
# returns to the sign-in screen.
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

if [[ -d ios/App/App ]]; then
  cp native/GoogleService-Info.plist ios/App/App/GoogleService-Info.plist
  cp native/App.entitlements ios/App/App/App.entitlements
  cp native/SceneDelegate.swift ios/App/App/SceneDelegate.swift
  echo "Copied GoogleService-Info.plist, App.entitlements, and SceneDelegate into ios/App/App"
fi

# Capacitor does not write ios.infoPlist from capacitor.config.ts. Merge the
# camera / photo usage strings or iOS kills the app when the camera opens.
node scripts/apply-ios-privacy-plist.mjs
