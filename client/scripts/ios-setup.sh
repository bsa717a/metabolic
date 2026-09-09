#!/bin/bash
# iOS project setup script for Master Metabolic
# Run this on a Mac with Xcode installed.
#
# Prerequisites:
#   - macOS with Xcode 15+ installed
#   - CocoaPods: brew install cocoapods (or gem install cocoapods)
#   - Node.js 18+

set -e

cd "$(dirname "$0")/.."

echo "==> Installing dependencies..."
npm install

echo "==> Building web assets..."
npm run build

echo "==> Adding iOS platform..."
if [ -d ios/App ]; then
  echo "    ios/ already exists; skipping cap add ios"
else
  npx cap add ios
fi

echo "==> Applying native auth files..."
mkdir -p ios/App/App
bash scripts/apply-native-auth-patches.sh

echo "==> Syncing iOS project..."
npx cap sync ios

echo ""
echo "==================================================="
echo " iOS project generated at client/ios/App"
echo ""
echo " The Capacitor config has been synced, including:"
echo "   - Info.plist privacy descriptions (camera, photos)"
echo "   - Associated Domains entitlements (applinks)"
echo "   - Native Google/Apple sign-in plugins"
echo ""
echo " Next steps:"
echo "   1. Open Xcode: npx cap open ios"
echo "   2. Select the App target"
echo "   3. Under Signing & Capabilities:"
echo "      - Team: Cliffs Mama, LLC (8FG8V9P49A)"
echo "      - Bundle ID should be: com.mastermetabolic.app"
echo "      - Enable 'Automatically manage signing'"
echo ""
echo "   4. VERIFY Sign in with Apple capability is present"
echo ""
echo "   5. VERIFY Associated Domains:"
echo "      - In Signing & Capabilities, click '+' if needed"
echo "      - Ensure 'Associated Domains' capability is present"
echo "      - Domains should include:"
echo "          applinks:metaos.mastermetabolic.com"
echo "          applinks:metabolic-v1.web.app"
echo ""
echo "   6. VERIFY Info.plist usage descriptions:"
echo "      - Open ios/App/App/Info.plist"
echo "      - Confirm NSCameraUsageDescription is set"
echo "      - Confirm NSPhotoLibraryUsageDescription is set"
echo ""
echo "   7. Build and run on simulator or device"
echo ""
echo " For TestFlight upload:"
echo "   - Product → Archive"
echo "   - Distribute App → App Store Connect"
echo "   - Upload to Apple ID: 6810053439"
echo ""
echo " See docs/app-store-ios.md for APNs setup and full checklist."
echo "==================================================="
