#!/usr/bin/env bash
# Single boot path for the Septena frontend.
#
# Why this exists: in the past, two `next` processes ended up bound to :7777
# (a stale `next start` against an old `.next/` build, plus `next dev`).
# The browser kept hitting whichever answered first, so source edits looked
# like they "reverted." This script guarantees one fresh dev server on :7777.
set -euo pipefail

PORT=7777
PIDS=$(lsof -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "[dev.sh] killing existing :$PORT listener(s): $PIDS"
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
  sleep 0.5
fi

exec npx next dev --port "$PORT"
