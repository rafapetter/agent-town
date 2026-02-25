# Agent Town

A framework-agnostic JavaScript library that visualizes AI agents working in a pixel art office. Drop it into any project — no IDE required.

Each agent you register gets its own animated pixel character that walks to a desk, sits down, and visually reflects what it's doing: typing when writing code, reading when scanning files, thinking when processing, waiting when it needs your input.

## Features

- **Zero dependencies** — pure TypeScript, renders to a single `<canvas>`
- **Framework-agnostic** — works with vanilla JS, React, Vue, Svelte, or anything that has a DOM
- **Plug into any agent system** — just call `addAgent` / `updateAgent` from your code, webhooks, or WebSocket messages
- **Pixel art characters** — 10 diverse, procedurally-colored character palettes
- **Live activity tracking** — characters animate based on status: `typing`, `reading`, `thinking`, `waiting`, `success`, `error`
- **Speech bubbles** — show what each agent is working on
- **BFS pathfinding** — characters walk realistic paths through the office
- **Auto-scaling** — fits any container size, pixel-perfect at integer zoom
- **Responsive** — handles resize automatically via `ResizeObserver`
- **Clickable agents** — click a character to identify it
- **12 workstations** — supports up to 12 concurrent agents out of the box

## Install

```bash
npm install agent-town
```

Or use a CDN:

```html
<script src="https://unpkg.com/agent-town/dist/agent-town.umd.cjs"></script>
```

## Quick Start

```html
<div id="office" style="width: 100%; height: 500px;"></div>

<script type="module">
  import { AgentTown } from 'agent-town';

  const town = new AgentTown({
    container: document.getElementById('office'),
  });

  // Add an agent — it walks to an available desk automatically
  town.addAgent({ id: 'claude', name: 'Claude' });

  // Update what the agent is doing
  town.updateAgent('claude', {
    status: 'typing',
    message: 'Writing auth module...',
  });

  // Later, mark it done
  town.updateAgent('claude', {
    status: 'success',
    message: 'Build passed!',
  });
</script>
```

## API

### `new AgentTown(config)`

Creates the visualization and starts rendering.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `container` | `HTMLElement` | *required* | DOM element to render into |
| `scale` | `number` | auto | Pixel zoom level (auto-calculated from container size) |
| `gridWidth` | `number` | `24` | Office grid width in tiles |
| `gridHeight` | `number` | `16` | Office grid height in tiles |
| `onAgentClick` | `(id: string) => void` | — | Callback when a character is clicked |

### `town.addAgent(config)`

Spawns a new agent character at the office door. It walks to the next available desk.

```typescript
town.addAgent({
  id: 'agent-1',       // unique identifier
  name: 'Claude',      // display name
  status: 'typing',    // optional initial status
  message: 'Starting…' // optional speech bubble
});
```

### `town.updateAgent(id, update)`

Updates an agent's status and/or message.

```typescript
town.updateAgent('agent-1', {
  status: 'reading',              // new status
  message: 'Scanning codebase…',  // speech bubble text (null to clear)
});
```

**Available statuses:**

| Status | Animation | Icon |
|--------|-----------|------|
| `idle` | Standing still | Gray dot |
| `typing` | Arms moving | Blue dot |
| `reading` | Arms down, focused | Purple dot |
| `thinking` | Standing still | Animated dots |
| `waiting` | Standing still | Pulsing `!` |
| `success` | Standing still | Green checkmark |
| `error` | Standing still | Red X |

### `town.removeAgent(id)`

Removes an agent and frees its desk.

### `town.getAgent(id)` / `town.getAgents()`

Retrieve agent instances for inspection.

### `town.on(event, callback)` / `town.off(event, callback)`

Subscribe to events:

```typescript
town.on('agentAdded', (id) => console.log(`${id} joined`));
town.on('agentClick', (id) => console.log(`clicked ${id}`));
town.on('agentRemoved', (id) => console.log(`${id} left`));
```

### `town.destroy()`

Stops rendering, removes the canvas, and cleans up all listeners.

## Integration Examples

### With WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8080/agents');

ws.onmessage = (event) => {
  const { type, id, name, status, message } = JSON.parse(event.data);

  switch (type) {
    case 'spawn':  town.addAgent({ id, name }); break;
    case 'update': town.updateAgent(id, { status, message }); break;
    case 'remove': town.removeAgent(id); break;
  }
};
```

### With React

```tsx
import { useEffect, useRef } from 'react';
import { AgentTown } from 'agent-town';

function AgentOffice({ agents }) {
  const ref = useRef<HTMLDivElement>(null);
  const townRef = useRef<AgentTown>();

  useEffect(() => {
    townRef.current = new AgentTown({ container: ref.current! });
    return () => townRef.current?.destroy();
  }, []);

  useEffect(() => {
    const town = townRef.current;
    if (!town) return;

    const current = new Set(town.getAgents().map(a => a.id));
    for (const a of agents) {
      if (!current.has(a.id)) town.addAgent(a);
      else town.updateAgent(a.id, a);
    }
  }, [agents]);

  return <div ref={ref} style={{ width: '100%', height: 500 }} />;
}
```

### With Server-Sent Events

```javascript
const events = new EventSource('/api/agent-stream');

events.onmessage = (e) => {
  const { action, ...data } = JSON.parse(e.data);
  if (action === 'add') town.addAgent(data);
  if (action === 'update') town.updateAgent(data.id, data);
  if (action === 'remove') town.removeAgent(data.id);
};
```

## Development

```bash
git clone https://github.com/your-org/agent-town.git
cd agent-town
npm install
npm run dev
```

Open `http://localhost:5173` to see the interactive demo.

### Build the library

```bash
npm run build
```

Outputs to `dist/`:
- `agent-town.js` — ES module
- `agent-town.umd.cjs` — UMD (for `<script>` tags)
- `index.d.ts` — TypeScript declarations

## Architecture

```
src/
├── index.ts          Public exports
├── AgentTown.ts      API facade — the only class users interact with
├── engine.ts         requestAnimationFrame game loop
├── renderer.ts       Canvas 2D rendering (tiles, furniture, characters, UI)
├── world.ts          Grid, office layout, BFS pathfinding
├── agent.ts          Agent entity, state machine, movement interpolation
├── sprites.ts        Pixel art character templates and palette system
└── types.ts          TypeScript interfaces
```

## Roadmap

- [ ] Custom tilesets and character sprites
- [ ] Layout editor (drag-and-drop furniture)
- [ ] Sound effects and notifications
- [ ] Sub-agent visualization (parent → child relationships)
- [ ] Dark / light office themes
- [ ] Agent-to-agent communication arrows
- [ ] Built-in WebSocket server adapter
- [ ] Vue / Svelte wrapper components
- [ ] Export office state as JSON

## Inspired By

[Pixel Agents](https://github.com/pablodelucca/pixel-agents) — VS Code extension that turns Claude Code agents into animated pixel art characters. Agent Town takes the same concept and makes it a standalone, framework-agnostic library that works anywhere JavaScript runs.

## License

[MIT](LICENSE)
