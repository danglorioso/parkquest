#!/bin/sh
set -e

# Install pnpm
npm install -g pnpm

# Install JS dependencies from repo root
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

# Install CocoaPods dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile/ios"
pod install
