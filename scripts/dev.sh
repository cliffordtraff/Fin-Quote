#!/usr/bin/env bash
set -e

PORT=3000

if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "❌ Port $PORT already in use. Kill the process first."
  exit 1
fi

exec npm run dev:next
