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
echo " Next steps:"
echo "   1. Open Xcode: npx cap open ios"
echo "   2. Select the App target"
echo "   3. Under Signing & Capabilities:"
echo "      - Team: Cliffs Mama, LLC (8FG8V9P49A)"
echo "      - Bundle ID should be: com.mastermetabolic.app"
echo "      - Enable 'Automatically manage signing'"
echo "   4. Confirm Signing & Capabilities includes Sign in with Apple"
echo "   5. Build and run on simulator or device"
echo ""
echo " For TestFlight upload:"
echo "   - Product → Archive"
echo "   - Distribute App → App Store Connect"
echo "   - Upload to Apple ID: 6810053439"
echo "==================================================="
