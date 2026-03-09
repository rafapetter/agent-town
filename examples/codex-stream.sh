#!/usr/bin/env bash

# Codex NDJSON Stream → Agent Town Bridge
#
# Wraps `codex exec --json` and pipes each NDJSON line to the bridge server.
# This gives you real-time event streaming from Codex into Agent Town.
#
# Usage:
#   ./codex-stream.sh "Fix the authentication bug in login.ts"

BRIDGE_URL="${AGENT_TOWN_BRIDGE:-http://localhost:3001/hooks}"

if [ -z "$1" ]; then
  echo "Usage: ./codex-stream.sh \"<your prompt>\""
  exit 1
fi

echo "[agent-town] Streaming Codex events to $BRIDGE_URL"

codex exec --json "$1" | while IFS= read -r line; do
  # Forward each NDJSON line to the bridge server
  curl -s -X POST "$BRIDGE_URL" \
    -H "Content-Type: application/json" \
    -d "$line" \
    --max-time 3 \
    > /dev/null 2>&1 &

  # Also print to stdout for visibility
  echo "$line"
done
