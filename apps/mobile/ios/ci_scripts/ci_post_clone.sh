#!/bin/sh
set -e

echo "Running Xcode Cloud post-clone"

cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"

pod install --repo-update