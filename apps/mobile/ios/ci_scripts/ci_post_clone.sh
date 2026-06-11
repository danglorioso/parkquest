#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

brew install node

npm install -g pnpm

cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

# .env.local is gitignored, so Xcode Cloud clones have no EXPO_PUBLIC_* values.
# Without this file the JS bundle embeds publishableKey=undefined and the app
# aborts on launch (TestFlight builds 30/31). Values here are public by design
# (EXPO_PUBLIC_* ships in the bundle); prefer Xcode Cloud workflow environment
# variables when set, falling back to the current production values.
cat > "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/.env.local" <<EOF
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:-pk_test_cXVhbGl0eS1kb2UtMjIuY2xlcmsuYWNjb3VudHMuZGV2JA}
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-https://www.parkquest.me}
EOF

cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
pod install
