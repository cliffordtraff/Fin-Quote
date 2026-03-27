#!/usr/bin/env bash
set -e

PORT=3000

if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "❌ Port $PORT already in use. Kill the process first."
  exit 1
fi

# Check data freshness (non-blocking)
node scripts/check-data-freshness.js 2>/dev/null || true

exec npm run dev:next -- --hostname localhost
