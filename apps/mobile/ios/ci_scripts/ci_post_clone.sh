#!/bin/sh
set -e

echo "PATH=$PATH"

which node || true
which npm || true

find /usr -name node 2>/dev/null | head -20 || true

exit 1