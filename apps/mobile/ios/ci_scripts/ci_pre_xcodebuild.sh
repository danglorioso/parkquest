#!/bin/sh
set -e

echo "Checking Node"

which node || true
node --version || true

cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
pod install --repo-update