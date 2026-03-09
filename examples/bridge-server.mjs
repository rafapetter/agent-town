#!/usr/bin/env node

/**
 * Agent Town Bridge Server
 *
 * A lightweight WebSocket bridge that receives hook events from coding agents
 * (Claude Code, Cursor, Codex) and forwards them to an Agent Town visualization.
 *
 * Usage:
 *   node bridge-server.mjs
 *
 * The server listens on:
 *   - HTTP  :3001  — receives POST /hooks from Claude Code & Cursor
 *   - WS    :3001  — WebSocket for Agent Town browser clients
 *
 * Zero dependencies — uses only Node.js built-in modules.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;

// ── Agent state tracking ──────────────────────────────────────────────
const agents = new Map(); // agentId → { name, status, message, tool }

function getAgentId(event) {
  // Use session_id (Claude Code) or conversation_id (Cursor) as agent identifier
  return event.session_id || event.conversation_id || event.thread_id || 'unknown';
}

function getAgentName(event) {
  // Derive a friendly name from the source tool
  if (event.session_id) return `Claude Code`;
  if (event.conversation_id) return `Cursor Agent`;
  if (event.thread_id) return `Codex`;
  return 'Agent';
}

// ── Map hook events to Agent Town statuses ────────────────────────────
function mapEventToUpdate(event) {
  const id = getAgentId(event);
  const hookEvent = event.hook_event_name || event.type || '';

  let update = null;

  switch (hookEvent) {
    // ── Session lifecycle ──
    case 'SessionStart':
    case 'sessionStart':
    case 'thread.started':
      update = { type: 'spawn', id, name: getAgentName(event), status: 'idle', message: 'Session started' };
      break;

    case 'SessionEnd':
    case 'sessionEnd':
      update = { type: 'remove', id };
      break;

    // ── Tool use → typing/reading ──
    case 'PreToolUse':
    case 'preToolUse':
    case 'item.started': {
      const tool = event.tool_name || event.item?.type || '';
      const input = event.tool_input || {};
      let status = 'typing';
      let message = `Using ${tool}...`;

      if (/read|grep|glob|search/i.test(tool)) {
        status = 'reading';
        message = `Reading files...`;
      } else if (/bash|shell|command/i.test(tool) || tool === 'command_execution') {
        status = 'typing';
        message = input.command ? `$ ${input.command.slice(0, 40)}` : 'Running command...';
      } else if (/edit|write/i.test(tool) || tool === 'file_changes') {
        status = 'typing';
        message = input.file_path ? `Editing ${input.file_path.split('/').pop()}` : 'Editing files...';
      } else if (/think|reason/i.test(tool) || tool === 'reasoning') {
        status = 'thinking';
        message = 'Thinking...';
      }

      update = { type: 'update', id, status, message };
      break;
    }

    case 'PostToolUse':
    case 'postToolUse':
    case 'item.completed': {
      const tool = event.tool_name || event.item?.type || '';
      update = { type: 'update', id, status: 'thinking', message: `Processing ${tool} result...` };
      break;
    }

    case 'PostToolUseFailure':
    case 'postToolUseFailure':
    case 'turn.failed':
      update = { type: 'update', id, status: 'error', message: 'Tool failed' };
      break;

    // ── File edits (Cursor-specific) ──
    case 'afterFileEdit': {
      const file = event.file_path?.split('/').pop() || 'file';
      update = { type: 'update', id, status: 'typing', message: `Edited ${file}` };
      break;
    }

    // ── Agent finished ──
    case 'Stop':
    case 'stop':
    case 'turn.completed':
    case 'agent-turn-complete':
      update = { type: 'update', id, status: 'success', message: 'Done!' };
      break;

    // ── Subagents ──
    case 'SubagentStart':
    case 'subagentStart': {
      const subId = `${id}_sub`;
      update = { type: 'spawn', id: subId, name: `${getAgentName(event)} (sub)`, status: 'thinking', message: 'Subagent started' };
      break;
    }

    case 'SubagentStop':
    case 'subagentStop': {
      const subId = `${id}_sub`;
      update = { type: 'remove', id: subId };
      break;
    }

    default:
      // Unknown event — skip
      return null;
  }

  // Track agent state
  if (update) {
    if (update.type === 'spawn') {
      agents.set(update.id, { name: update.name, status: update.status, message: update.message });
    } else if (update.type === 'remove') {
      agents.delete(update.id);
    } else if (update.type === 'update') {
      const agent = agents.get(update.id);
      if (agent) {
        agent.status = update.status;
        agent.message = update.message;
      }
    }
  }

  return update;
}

// ── WebSocket server ──────────────────────────────────────────────────
const server = createServer(handleHTTP);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] Client connected (${clients.size} total)`);

  // Send current agent state to the new client
  for (const [id, agent] of agents) {
    ws.send(JSON.stringify({ type: 'spawn', id, ...agent }));
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] Client disconnected (${clients.size} total)`);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ── HTTP handler (receives POST hooks) ────────────────────────────────
function handleHTTP(req, res) {
  // CORS headers for browser clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/hooks') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        console.log(`[hook] ${event.hook_event_name || event.type || 'unknown'} from ${getAgentId(event)}`);

        const update = mapEventToUpdate(event);
        if (update) broadcast(update);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[hook] Parse error:', err.message);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, agents: agents.size, clients: clients.size }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

// ── Start ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │  Agent Town Bridge Server               │
  │                                         │
  │  HTTP hooks:  http://localhost:${PORT}/hooks │
  │  WebSocket:   ws://localhost:${PORT}        │
  │  Health:      http://localhost:${PORT}/health│
  └─────────────────────────────────────────┘
  `);
});
