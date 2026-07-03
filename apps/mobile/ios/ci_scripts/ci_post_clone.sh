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
# aborts on launch (TestFlight builds 30/31). The publishable key must come from
# the Xcode Cloud workflow environment — no fallback, so a missing or misnamed
# variable fails the build instead of silently shipping the wrong Clerk instance.
if [ -z "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then
  echo "error: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set in the Xcode Cloud workflow environment" >&2
  exit 1
fi

cat > "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/.env.local" <<EOF
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-https://www.parkquest.me}
EOF

cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
pod install
