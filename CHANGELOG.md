# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-03-09

Major upgrade to environments, rendering, task visualization, and project infrastructure.

### Added

- **Kanban task visualization in the world** — tasks are rendered as pixel-art items inside kanban stage rooms; each room's top half displays task items and the bottom half holds agents
- **Task overflow handling** — when tasks exceed the top-half capacity, a `+` indicator appears at the last slot; a background watermark count shows the total task count per stage in the corridor layer
- **Done stage visualization** — completed tasks render faded (45% opacity) with green checkmarks in the Done room; the completion bag (big object) displays in the bottom half with the task count layered on top
- **Room mode API** — `town.setRoomMode(mode)` to switch between `kanban` and `free` room layouts
- **Next.js playground app** — full-featured playground at `/playground` with workspace presets (Startup, Agency, Enterprise), agent management, project/kanban/timeline views, review approval flow, analytics, and chat panels
- **Simulation engine** — `AgentSimulation` class that drives realistic multi-agent workflows with task creation, assignment, status transitions, code reviews, and configurable speed
- **Workspace presets** — pre-built team configurations (Startup 4-agent, Agency 8-agent, Enterprise 12-agent) with roles, teams, and color assignments
- **Flying task animations** — tasks animate between rooms when moving across kanban stages
- **Agent speech bubbles with status** — agents show contextual messages based on their current activity (coding, reviewing, testing, etc.)
- **Enhanced particle effects** — sparkle, smoke, and completion particles tied to agent actions
- **10 character palettes** — expanded diverse, procedurally-colored pixel art character set

### Changed

- **Agent positioning** — agents now occupy the bottom half of rooms starting 1 block below the midpoint, with 1 empty row between agent rows for visual spacing
- **Task placement** — tasks fill the top half of rooms starting from the first walkable row, stopping 1 row before the corridor layer
- **Environment rendering** — significant renderer overhaul with procedural furniture, environment-specific decorations, and animated elements across all 6 environments
- **World generation** — improved multi-room layouts with corridor passages between stages
- **Project infrastructure** — migrated demo from vanilla HTML to Next.js; added app/, components/, and lib/ directories for the playground

### Fixed

- **Agent spawn race condition** — fixed "Agent already exists" error when restarting simulations by properly clearing pending spawn timeouts
- **Zone placement in Done room** — all rooms now consistently use bottom-half zones for agent placement

## [0.1.0] - 2025-02-01

Initial release of Agent Town — a framework-agnostic TypeScript library for pixel-art AI agent visualization.

### Added

- **Rendering engine** — HTML5 Canvas 2D with procedural rendering (no sprite sheets), `imageSmoothingEnabled = false` for crisp pixel art at any scale
- **6 themed environments**
  - Office — desks, meeting rooms with couch/coffee table, water cooler, whiteboard (3 themes: casual / business / hybrid)
  - Rocket Launch — rocket on right side, control panels, tool benches, fuel tanks
  - Space Station — animated warp-speed viewscreen, consoles, airlocks, lab equipment
  - Farm & Ranch — animated animals (cow grazing, chicken pecking, sheep breathing), tractor with spinning wheels & exhaust, barn, crops
  - Hospital (Research Lab) — pharmaceutical/research themed, lab benches, equipment, reception
  - Pirate Ship — captain's quarters, cannons, barrels, map table, crow's nest
- **3 grid sizes** — Small (20×13, up to 8 agents), Medium (26×16, up to 16 agents), Large (34×20, up to 24 agents)
- **ActivityZone system** — 30+ zone types across all 6 environments; agents are assigned to zones and move between them based on status
- **Multi-room layouts** — internal walls with doorways; agents pathfind through rooms
- **BFS pathfinding** — characters walk realistic paths through the environment
- **10 character palettes** — diverse, procedurally-colored pixel art characters
- **Agent statuses** — `idle`, `typing`, `reading`, `thinking`, `waiting`, `success`, `error` with corresponding animations and icons
- **Speech bubbles** — display agent messages above their heads
- **Animated elements** — warp-speed viewscreen, farm animals (cow/chicken/sheep), tractor wheels & exhaust, particle effects, idle animations
- **Activity log API** — `logActivity()`, `getActivityLog()`, `clearActivityLog()`
- **Task management API** — `addTask()`, `updateTask()`, `getTasks()`, `getTasksByStage()`, `clearTasks()` with kanban stages
- **Code review API** — `addReview()`, `resolveReview()`, `getReviews()`, `getPendingReviews()`, `clearReviews()`
- **Event system** — subscribe to `ready`, `agentAdded`, `agentUpdated`, `agentRemoved`, `agentClick`, `activity`, `taskUpdated`, `reviewAdded`, `themeChanged`
- **Auto-scaling** — canvas auto-resizes to fill container via `ResizeObserver`
- **Clickable agents** — click detection with `onAgentClick` callback
- **Demo dashboard** — `index.html` at project root with sidebar (agents, activity feed, kanban board, reviews, analytics, chat tabs)
- **Dual build output** — ES module (`dist/agent-town.js`) + UMD (`dist/agent-town.umd.cjs`) + TypeScript declarations
- **CI/CD** — GitHub Actions for build on push/PR (`ci.yml`) + auto-publish to npm on `v*` tags (`publish.yml`)

[0.2.0]: https://github.com/rafapetter/agent-town/releases/tag/v0.2.0
[0.1.0]: https://github.com/rafapetter/agent-town/releases/tag/v0.1.0
