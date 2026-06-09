#!/bin/sh
set -e

echo "=== PRE-XCODEBUILD ==="
echo "PATH=$PATH"

which node || true
which npm || true
which pnpm || true

node --version || true
npm --version || true

exit 0