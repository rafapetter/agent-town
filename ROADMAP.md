# Roadmap

This document outlines the planned development trajectory for Agent Town. Versions are prioritized by impact — each builds on the previous to grow the library from a standalone canvas widget into a full ecosystem for AI agent visualization.

## Current: v0.2.0 (Released)

- Kanban task visualization in the world — tasks rendered as pixel-art items inside stage rooms
- Task overflow handling with `+` indicator and background watermark counts
- Done stage visualization with faded tasks, green checkmarks, and completion bag
- Room mode API (`kanban` / `free`)
- Next.js playground app with workspace presets, simulation engine, reviews, analytics
- Flying task animations between kanban stages
- Enhanced agent positioning — top half for tasks, bottom half for agents with proper spacing
- Improved rendering engine with procedural furniture and environment decorations

## Previous: v0.1.0

- Full procedural pixel-art rendering engine (HTML5 Canvas 2D, zero dependencies)
- 6 themed environments: Office, Rocket Launch, Space Station, Farm & Ranch, Hospital, Pirate Ship
- 3 grid sizes (small/medium/large) supporting up to 24 concurrent agents
- 30+ activity zone types with multi-room layouts and BFS pathfinding
- Animated elements: warp-speed viewscreen, farm animals, tractor, particle effects
- Activity log, task management (kanban), and code review APIs
- Published to npm, CI/CD via GitHub Actions

---

## v0.3.0 — Integration & Visibility

Goal: Make it easy to discover, try, and adopt in real projects.

- [ ] **GitHub Pages live demo** — deploy the playground so people can try it in-browser without installing
- [ ] **React wrapper component** — `<AgentTown />` with reactive props, since most AI apps use React
- [ ] **Vue / Svelte wrappers** — same pattern for other popular frameworks
- [ ] **CDN / script tag support** — verify UMD bundle works out of the box with zero-build usage

## v0.4.0 — Real-World Agent Integration

Goal: Connect to actual AI agent frameworks so the visualization updates automatically.

- [ ] **Agent SDK adapters** — connectors for LangGraph, CrewAI, AutoGen, Claude Agent SDK that auto-map agent events to town updates
- [ ] **WebSocket / SSE streaming mode** — accept a URL to stream agent status updates from a backend
- [ ] **Custom activity zones** — let users define their own zone types and tile art

## v0.5.0 — Polish & Power Features

Goal: Add the details that make demos impressive and usage delightful.

- [ ] **Speech bubbles enhancements** — richer formatting, auto-truncation, queue system for rapid messages
- [ ] **Sound effects** — optional retro SFX for status changes (muted by default)
- [ ] **Recording / replay** — export sessions as GIF or video for demos and presentations
- [ ] **Mini-map** — overview panel for large environments with many agents

## v0.6.0 — Ecosystem

Goal: Enable community contributions and enterprise-ready embedding.

- [ ] **Embeddable widget** — floating button that opens agent-town as an overlay (like chat widgets)
- [ ] **Telemetry dashboard** — cost tracking, token usage, latency visualization alongside the pixel-art scene
- [ ] **Plugin system** — community-contributed environments, sprites, and animations
- [ ] **Custom tilesets and character sprites** — user-provided pixel art
- [ ] **Layout editor** — drag-and-drop furniture placement
- [ ] **Sub-agent visualization** — parent-child relationship arrows
- [ ] **Agent-to-agent communication** — visual arrows/lines between collaborating agents

---

## Contributing

If you're interested in working on any of these features, open an issue on the [GitHub repo](https://github.com/rafapetter/agent-town) to discuss the approach before submitting a PR.
