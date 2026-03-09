#!/usr/bin/env node

/**
 * Codex Notify Script for Agent Town
 *
 * Codex invokes the notify command with a JSON argument on each turn completion.
 * This script forwards that event to the bridge server.
 *
 * Setup: Add to ~/.codex/config.toml:
 *   notify = ["node", "/path/to/codex-notify.mjs"]
 */

const BRIDGE_URL = process.env.AGENT_TOWN_BRIDGE || 'http://localhost:3001/hooks';

const arg = process.argv[2];
if (!arg) process.exit(0);

try {
  const event = JSON.parse(arg);

  fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
} catch {
  // Silently ignore parse errors
}
