#!/usr/bin/env bash

# Cursor Hook Script for Agent Town
#
# Cursor hooks are command-based — they pipe JSON to stdin.
# This script reads the JSON and forwards it to the bridge server.
#
# Setup: Place this file at .cursor/hooks/agent-town.sh
#        Make it executable: chmod +x .cursor/hooks/agent-town.sh

BRIDGE_URL="${AGENT_TOWN_BRIDGE:-http://localhost:3001/hooks}"

# Read JSON from stdin
INPUT=$(cat)

# Forward to bridge server (fire-and-forget)
curl -s -X POST "$BRIDGE_URL" \
  -H "Content-Type: application/json" \
  -d "$INPUT" \
  --max-time 3 \
  > /dev/null 2>&1 &

exit 0
