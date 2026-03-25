# Octavius — Current Architecture & Status

## Overview

Octavius is a "Life OS" dashboard built with Next.js 14 App Router, SQLite (better-sqlite3), and OpenClaw gateway integration. It manages four life quadrants (Lifeforce, Industry, Fellowship, Essence) through an AI agent system.

## Architecture

```
Browser (React) → fetch() → Next.js API Routes → SQLite (.data/memory.sqlite)
                                                  ├── dashboard_tasks
                                                  ├── dashboard_checkins
                                                  ├── dashboard_journal
                                                  ├── dashboard_goals
                                                  ├── dashboard_connections
                                                  ├── dashboard_gratitude
                                                  ├── dashboard_focus_goals
                                                  ├── dashboard_schedule
                                                  ├── sprints / sprint_tasks
                                                  ├── memory_items (QMD hybrid search)
                                                  ├── memory_edges (knowledge graph)
                                                  ├── sessions / devices
                                                  ├── scheduled_agent_jobs / job_runs
                                                  └── gateway_events
```

- **No Zustand/localStorage** — SQLite is single source of truth
- **React state** (useState) only for ephemeral UI state (forms, modals, active tab)
- **Fleet store** (sessionStorage) for transient agent activity during session

## Tech Stack

- **Framework:** Next.js 14 App Router (TypeScript)
- **Database:** SQLite via better-sqlite3
- **Auth:** JWT sessions (jose), scrypt passwords, device fingerprinting/approval
- **Agent Gateway:** OpenClaw CLI at port 18789, with browser fallback adapter
- **Styling:** CSS custom properties (design tokens), inline styles, `<style jsx>`

## Views (11 total)

| View | Component | Description |
|------|-----------|-------------|
| Dashboard | `DashboardView` | Command Center — sprint board, daily standup, quadrant summaries |
| Lifeforce | `LifeforceView` | Health & wellness — check-ins, mood tracking, habits |
| Industry | `IndustryView` | Career & productivity — tasks, kanban board, focus goals |
| Fellowship | `FellowshipView` | Relationships — connections, outreach tracking |
| Essence | `EssenceView` | Soul & reflection — journal, gratitude, goals |
| Nerve Center | `NerveCenterView` | Agent observability — 4x3 room grid, live activity, task assignment |
| Agents | `AgentsView` | Fleet management — agent configs, status |
| Memory | `MemoryView` | Knowledge graph — search, browse, stats |
| LLM Costs | `CostsView` | Token usage tracking and cost intelligence |
| Settings | `SettingsView` | System configuration |
| Gateway | `GatewayView` | OpenClaw integration — connection status, topology, health |

## Agent System

### Hierarchy
```
Orchestrator
├── gen-lifeforce (Health quadrant)
├── gen-industry (Career quadrant)
├── gen-fellowship (Relationships quadrant)
└── gen-essence (Soul quadrant)
    ├── specialist-research
    ├── specialist-writing
    ├── specialist-marketing
    ├── specialist-engineering
    ├── specialist-video
    └── specialist-image
```

### Dispatch Flow
1. User sends message → `/api/chat` or `/api/agents/dispatch`
2. Orchestrator routes to appropriate generalist based on quadrant context
3. Generalist can output `SPAWN_SPECIALIST:<id>` marker → auto-cascades to specialist
4. Results flow back through fleet store → Nerve Center live activity

## API Surface

### Dashboard CRUD
- `GET/POST /api/dashboard/tasks` — Task management (kanban)
- `GET/POST /api/dashboard/checkins` — Wellness check-ins
- `GET/POST /api/dashboard/journal` — Journal entries
- `GET/POST /api/dashboard/goals` — Life goals
- `GET/POST /api/dashboard/connections` — Social connections
- `GET/POST /api/dashboard/gratitude` — Gratitude entries
- `GET/POST /api/dashboard/focus-goals` — Daily focus goals
- `GET/POST /api/dashboard/schedule` — Schedule items
- `GET/PUT /api/dashboard/profile` — User profile

### Agent & Gateway
- `POST /api/agents/dispatch` — Dispatch task to agent
- `POST /api/agents/spawn` — Spawn agent directly
- `GET/POST /api/agents/config` — Agent configuration
- `GET /api/agents/queue` — Task queue
- `POST /api/chat` — Conversational interface
- `GET /api/gateway/health` — Gateway health proxy
- `POST /api/gateway/provision` — Provision agent workspaces
- `POST /api/gateway/validate-token` — Token validation

### Memory (QMD)
- `GET/POST /api/memory/items` — Memory CRUD
- `GET /api/memory/search` — Hybrid search (FTS5 + vector + RRF)
- `GET /api/memory/graph` — Knowledge graph traversal
- `GET /api/memory/stats` — Memory statistics
- `GET /api/memory/context` — Context retrieval
- `POST /api/memory/annotations` — Context annotations
- `GET /api/memory/config` — Memory configuration
- `POST /api/memory/heartbeat` — Heartbeat actions
- `GET /api/memory/jobs` — Background job status

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Register
- `GET /api/auth/session` — Session check
- `POST /api/auth/logout` — Logout
- `POST /api/auth/device/approve` — Device approval

### Other
- `GET /api/health` — App health check
- `GET /api/heartbeat` — Proactive heartbeat actions
- `GET /api/llm-cost/*` — LLM cost tracking
- `GET /api/lcm/*` — Lifecycle management
- `GET /api/obsidian/*` — Obsidian sync (stub)

## Data Hooks

All hooks follow the pattern: `{ data, loading, error, mutate() }` — no external deps.

- `useTasks()` — Tasks with create/update/delete
- `useCheckins()` — Wellness check-ins
- `useJournal()` — Journal entries
- `useConnections()` — Social connections
- `useGoals()` — Life goals
- `useGratitude()` — Gratitude entries
- `useFocusGoals()` — Daily focus goals
- `useSchedule()` — Schedule items
- `useProfile()` — User profile
- `useSprint()` — Sprint management
- `useAuth()` — Auth state and session

## Recent Changes (2026-03-25)

### Bug Fixes
- Device approval datetime format (ISO vs SQLite format)
- Device approval missing email in session creation
- ANSI escape codes in CLI output causing JSON parse failures
- Variable shadowing in device/approve/route.ts

### New Features
- Auth gate on all pages (login redirect)
- Specialist cascade: generalist SPAWN_SPECIALIST auto-spawns specialist
- **Nerve Center redesigned**: Pure React/CSS 2D game-style dashboard
  - 4x3 CSS Grid of 10 rooms (dark theme forced)
  - Right sidebar: ROOM ROUTING + LIVE ACTIVITY panels
  - Bottom stats bar: AGENTS / LIVE / DONE
  - Agent chips with status dots, task assignment modal
- **Gateway view replaced**: Broken Phaser game → functional React dashboard
  - Connection status with health checks
  - Agent topology tree visualization
  - System architecture service cards

## Known Integration Gaps

See `docs/integration-gaps.md` for detailed tracking. Key items:
1. Multi-quadrant fan-out not wired to main dispatch
2. Fleet activity lost on page reload (sessionStorage only)
3. Budget gate incomplete (getDailySpend always returns 0)
4. Autonomous mode has no UI toggle
5. Gateway fallback doesn't update Nerve Center UI
6. Agent config doesn't affect CLI dispatch
7. Health data not connected to Lifeforce agent tasks
8. Obsidian bidirectional sync not implemented
9. Kanban updates not real-time synced to fleet activity
10. Sub-agent results not surfaced in task UI

## Development

```bash
# Dev server
npx next dev -p 3001

# Lint
npx next lint

# Build
npx next build

# Test credentials
# Email: test@octavius.dev
# Password: TestPass123!
```
