#!/bin/sh
set -e

# Newer Xcode Cloud images ship node; when it's missing, install a pinned
# build straight from nodejs.org — a single retried download. (`brew install
# node` pulled 20+ bottles from ghcr.io, which reset connections mid-fetch
# and failed the build; nodejs.org is one artifact behind a stable CDN.)
NODE_VERSION=22.20.0
if command -v node >/dev/null 2>&1; then
  echo "==> node already present: $(node --version)"
else
  echo "==> installing node v${NODE_VERSION} from nodejs.org"
  case "$(uname -m)" in
    arm64) NODE_DIST="node-v${NODE_VERSION}-darwin-arm64" ;;
    *) NODE_DIST="node-v${NODE_VERSION}-darwin-x64" ;;
  esac
  curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors \
    "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.gz" -o "$HOME/node.tar.gz"
  tar -xzf "$HOME/node.tar.gz" -C "$HOME"
  export PATH="$HOME/$NODE_DIST/bin:$PATH"
fi

# Xcode build phases don't inherit this script's PATH; .xcode.env resolves
# node via `command -v node` in a fresh shell, which misses the tarball
# install above. Pin the absolute path in .xcode.env.local (gitignored, so
# absent from CI clones — writing it here can't clobber anything).
echo "export NODE_BINARY=$(command -v node)" > "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios/.xcode.env.local"

echo "==> installing pnpm"
# Major pinned; pnpm self-switches to the exact version in the root
# package.json `packageManager` field.
npm install -g pnpm@10

echo "==> pnpm install"
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

echo "==> writing .env.local"
cat > "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/.env.local" <<EOF
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=${EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL:-https://www.parkquest.me}
EXPO_PUBLIC_PROJECT_ID=${EXPO_PUBLIC_PROJECT_ID:-2689b440-3af8-4807-9f93-e606c68556bb}
EXPO_PUBLIC_SENTRY_DSN=${EXPO_PUBLIC_SENTRY_DSN:-}
EOF

CMAKE_VERSION=3.31.5
if command -v cmake >/dev/null 2>&1; then
  echo "==> cmake already present: $(cmake --version | head -1)"
else
  # hermes-engine.podspec builds Hermes from source on this RN version and
  # shells out to Pod::Executable::which!('cmake') — fails pod install
  # outright if missing. Direct download (not brew): a fresh CI image's
  # first `brew install` pulls the full formula index plus 20+ unrelated
  # bottles from ghcr.io and has reset connections mid-fetch before (see
  # the node install above); Kitware ships a universal binary tarball.
  echo "==> installing cmake v${CMAKE_VERSION} from github.com/Kitware/CMake"
  curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors \
    "https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-macos-universal.tar.gz" \
    -o "$HOME/cmake.tar.gz"
  tar -xzf "$HOME/cmake.tar.gz" -C "$HOME"
  export PATH="$HOME/cmake-${CMAKE_VERSION}-macos-universal/CMake.app/Contents/bin:$PATH"
fi

echo "==> pod install"
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
# sentry-react-native 8.18+ vendors a prebuilt Sentry.xcframework fetched from
# GitHub Releases at pod-install time by default. That binary caused a native
# segfault inside SentrySDK.start on TestFlight (build 91) — reproducible on
# every launch, survived a full reinstall. Falling back to the source-built
# Sentry pod (pre-8.18 behavior) as the documented escape hatch.
export SENTRY_USE_XCFRAMEWORK=0
# CocoaPods has been observed running translated under Rosetta2 on Xcode
# Cloud's arm64 runners (it warns and names this exact workaround) — under
# translation, cmake and other native gem extensions can end up arch-
# mismatched and fail in stranger ways than a clean missing-binary error.
# uname -m reports x86_64 while translated even on real arm64 hardware, so
# check the underlying hardware separately before forcing the native slice.
if [ "$(uname -m)" = "x86_64" ] && [ "$(sysctl -in hw.optional.arm64)" = "1" ]; then
  echo "==> pod running under Rosetta2 on arm64 hardware, forcing native arch"
  arch -arm64 pod install
else
  pod install
fi
