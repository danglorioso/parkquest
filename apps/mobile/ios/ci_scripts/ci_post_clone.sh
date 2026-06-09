#!/bin/sh
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

brew install node

npm install -g pnpm

cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
pod install
