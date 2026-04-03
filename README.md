# Octavius -- Personal Life Operating System

A self-hosted dashboard that orchestrates four life quadrants through AI agents, with a virtual Nerve Center for real-time agent observability. Built with Next.js 14, SQLite, Phaser 3, and [OpenClaw](https://github.com/openclaw/openclaw).

## What is Octavius?

Octavius splits your life into four quadrants, each managed by a dedicated AI agent:

| Quadrant | Agent | What it does |
|----------|-------|-------------|
| Lifeforce | agent-lifeforce | Health, biometrics, sleep, fitness, nutrition |
| Industry | agent-industry | Tasks, projects, focus goals, productivity |
| Fellowship | agent-fellowship | Relationships, social connections, contact tracking |
| Essence | agent-essence | Journaling, gratitude, reflection, meaning |

An orchestrator agent (`octavius-orchestrator`) routes your messages to the right quadrant agent or specialist (architect, coder, engineering, research, marketing, writing, video, image, n8n).

## Quick Start

### Prerequisites

- **Node.js 22** (`node -v` to check) — do NOT use Node 24, it has peer dependency issues with this project
- npm 10+ (ships with Node 22)
- Build tools for native modules: `python3`, `make`, `g++` (most systems have these already)
  - Ubuntu/Debian: `sudo apt-get install -y python3 make g++`
  - Amazon Linux: `sudo yum install -y python3 make gcc-c++`
  - macOS: `xcode-select --install`

### Install (one command)

```bash
npx create-octavius my-octavius
```

That's it. It clones the repo, installs dependencies, verifies native modules, creates config files, and tells you what to do next.

**Alternative** (if you prefer manual steps):

```bash
git clone https://github.com/wabecerra/octavius.git && cd octavius
npm run setup
npm run dev
```

`npm run setup` handles everything: installs dependencies, creates `.env.local`, creates the SQLite data directory, verifies `better-sqlite3` compiles, detects the OpenClaw gateway, and validates config files. If anything fails, it tells you exactly what to fix.

If something looks wrong after setup, run `npm run doctor` — it checks 20+ items and prints actionable fixes.

### First login — device approval

Octavius uses device approval for security. Only someone with access to the server (the machine running Octavius) can approve new devices.

**The full flow:**

1. Open http://localhost:3000 (or your deployed URL) — you'll see the login page
2. Click **"Create one"** to register a new account (email + password)
3. You'll see a green success message — now **sign in** with those credentials
4. The browser shows a **Device Approval Required** screen with a 6-character code (e.g. `8FE4E0`)
5. On the server machine (where Octavius is running), run:

```bash
# From the octavius directory
node bin/octavius approve-device <CODE>

# Example:
node bin/octavius approve-device 8FE4E0
```

6. The browser automatically detects the approval and redirects to the dashboard (it polls every 3 seconds)

**Important notes:**
- The approval code expires after **10 minutes** — if it expires, sign in again to get a new one
- Once a device is approved, it stays trusted for **30 days**
- The CLI must be run on the same machine where Octavius is running (it calls `http://localhost:3000` by default)
- If Octavius runs on a different port or host, set `OCTAVIUS_URL`: `OCTAVIUS_URL=http://localhost:4000 node bin/octavius approve-device <CODE>`
- You do NOT need to install the `octavius` CLI globally — just use `node bin/octavius` from the project directory

### Update

```bash
npm run update
```

This pulls the latest release, reinstalls dependencies, re-runs setup (won't overwrite your `.env.local` or data), and verifies the build. If you have local changes, it warns you but doesn't block — your data in `.data/` is never touched.

If you installed without git (zip download), re-install with `npx create-octavius` into a fresh directory and copy your `.data/` folder over.

### Important: do NOT do any of these

These are common mistakes made by AI coding assistants that break the app. **Everything is already configured correctly in the repo.**

- **Do NOT create component stubs** — all components (`OnboardingWizard`, `TaskBoardSection`, etc.) already exist
- **Do NOT remove `@tailwind` directives** from `globals.css` — they are required
- **Do NOT comment out** `import './globals.css'` in `layout.tsx` — this loads all styling
- **Do NOT convert** `postcss.config.mjs` to `.js` — the ESM format works with Next.js 14
- **Do NOT upgrade Next.js** to v15/v16 — the project is pinned to 14.2.35 intentionally
- **Do NOT modify** `next.config.mjs` to add Turbopack — not needed on v14
- **Do NOT delete** or recreate hooks — all hooks are exported from `src/hooks/index.ts`
- **Do NOT delete `package-lock.json`** — it ensures reproducible installs
- **Do NOT use `--legacy-peer-deps`** manually — the setup script handles this automatically if needed
- **Do NOT relax ESLint rules** — if the build fails on lint, fix the code, don't disable the rules

If you see a `Module not found` error after a fresh clone, the fix is `npm install`, not creating missing files.

#### Running in the background (recommended)

The dev server exits when your terminal closes. To keep it running persistently:

```bash
# Start detached with nohup (survives terminal close)
nohup npx next dev -p 3000 > /tmp/octavius.log 2>&1 &

# Check it's running
curl -s http://localhost:3000/api/gateway/health

# View logs
tail -f /tmp/octavius.log

# Stop it
pkill -f "next dev"
```

For production use, prefer `npm run build && npm start` or a process manager like `pm2`:

```bash
npm run build
pm2 start npm --name octavius -- start
```

### 3. (Optional) Connect OpenClaw gateway

If you want AI agents, install and run [OpenClaw](https://github.com/openclaw/openclaw):

```bash
npm i -g openclaw
openclaw gateway run --port 18789
```

Then install the Octavius plugin so your agent gets dashboard tools automatically:

```bash
# From the octavius repo
openclaw plugins install ./extensions/openclaw-octavius
openclaw gateway restart
```

Your agent now has tools like `octavius_task_create`, `octavius_checkin`, `octavius_journal`, etc. See [extensions/openclaw-octavius/README.md](extensions/openclaw-octavius/README.md) for the full tool list.

#### Persistent conversation memory (lossless-claw)

The setup script automatically installs [lossless-claw](https://github.com/Martian-Engineering/lossless-claw) when a gateway is detected. This gives all Octavius agents persistent conversation memory -- they never lose context, even in long conversations.

If it wasn't auto-installed, add it manually:

```bash
openclaw plugins install @martian-engineering/lossless-claw
```

When you click "Provision Agents" in Settings, the OpenClaw config is automatically generated with optimal lossless-claw settings:
- `freshTailCount: 32` -- protects the last 32 messages from compaction
- `incrementalMaxDepth: -1` -- unlimited DAG condensation depth
- `contextThreshold: 0.75` -- triggers compaction at 75% of context window
- Cron sessions are excluded from LCM storage (noise reduction)
- Sub-agent sessions are stateless (read-only access to LCM)
- Session idle timeout set to 7 days (LCM handles context persistence)

The Memory tab in the dashboard shows LCM status, conversation count, summary DAG depth, and lets you browse stored conversations.

Optionally, connect the dashboard UI to the gateway:
1. Go to Settings -> Gateway Connection
2. Enter `localhost` and port `18789`
3. Click "Provision Agents" -- this writes agent workspace files to `~/.openclaw/`
4. Go to Agents tab -> Agent Workspace Files -> edit the Markdown files with your personal info

## Features

### Dashboard
- Quadrant balance radar chart
- Weekly review prompts
- Compound loop phase tracking (Plan -> Work -> Review -> Compound)
- Sprint navigation (weekly cycles)
- Daily standup view (yesterday's done, today's in-progress, focus goals)

### Nerve Center (Virtual Town)
- Phaser 3 pixel-art visualization of the agent fleet
- 10 rooms: Vitality Lab, Task Forge, Writing Room, Research Lab, Commons, Media Studio, Command Hub, Automations Bay, Soul Workshop, Break Room
- 4 generalist agents + 9 specialist agents as animated sprites
- BFS pathfinding on a walk graph for agent navigation
- Real-time agent status sync from FleetStore
- Drag-and-drop agent reassignment between rooms
- Day/night ambient tinting based on system clock
- Agent mood system (neutral, happy, stressed, sleeping) with visual effects
- Dynamic room furniture reacting to workload
- Room-aware idle animations with emote cycling and speech bubbles
- Player character with WASD movement and E-key interaction
- Agent position persistence across tab switches via sessionStorage

### Lifeforce (Health)
- RingConn smart ring CSV import (drag-and-drop)
- Heart rate, HRV, SpO2, sleep stages, and activity charts
- Date range filtering (7d, 30d, 90d, custom)
- Automated sync via ROOK SDK (Android) or Health Auto Export (iOS) webhooks

### Industry (Career)
- Kanban task board (backlog -> in progress -> done)
- Daily focus goals (max 3)
- Daily schedule planner
- Task delegation to agents with approval gates

### Fellowship (Relationships)
- Connection tracking with contact frequency
- Overdue connection alerts
- Activity logging

### Essence (Soul)
- Journaling with auto-save
- Gratitude practice (1-3 items)
- Mood trend charts

### Agents
- Agent fleet overview (4 generalists + 9 specialists)
- Task delegation and tracking with subtask approval gates
- Agent workspace file editor (SOUL.md, AGENTS.md, USER.md, TOOLS.md)
- Nightly Evolution Job updates agent files with learned patterns
- Fleet SSE (Server-Sent Events) for real-time status updates

### Memory
- Hybrid search: BM25 full-text + vector similarity + reranking
- Memory types: episodic, semantic, procedural, entity_profile
- Knowledge graph with edges (related_to, inspired_by, etc.)
- LCM conversation history browser
- Obsidian vault integration (bidirectional sync)
- Spaced repetition decay scheduler
- Memory consolidation job (merge related items)
- Novelty detection for interesting content

### LLM Costs
- Per-model cost tracking and timeseries analysis
- Budget management with alerts
- Model pricing catalog (auto-synced from OpenRouter)

### Chat
- Direct conversation with Octavius orchestrator
- Agent task delegation from chat
- Session persistence via sessionStorage

### Settings
- Profile and preferences
- Model router configuration (OpenRouter default -> Bedrock fallback)
- API key management (AES-encrypted storage)
- Gateway connection management
- Scheduled jobs and heartbeat actions
- Memory configuration

### Lossless Context (LCM)
- Persistent conversation memory across all agent sessions via [lossless-claw](https://github.com/Martian-Engineering/lossless-claw)
- DAG-based summarization -- nothing is ever lost from conversations
- Auto-configured during agent provisioning (zero manual setup)
- LCM status panel in Memory tab (conversations, summary DAG depth, DB size)
- Cross-search LCM conversation history from the dashboard
- Evolution job feeds from LCM summaries to learn behavioral patterns
- Agents get `lcm_grep`, `lcm_describe`, `lcm_expand_query` tools automatically

### Obsidian Integration
- Two-way sync between Octavius memory and your Obsidian vault
- Memory items exported as markdown with YAML frontmatter
- Notes created in Obsidian auto-imported as memory items
- Vault knowledge graph visualization with wikilink parsing
- Synced/unsynced/phantom node color coding
- Configurable sync direction (bidirectional, push-only, pull-only)
- Works with the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin

## Troubleshooting

Run the built-in diagnostic tool:

```bash
npm run doctor
```

This checks Node version, dependencies, PostCSS/Tailwind config, environment files, port availability, and gateway connectivity.

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| CSS not loading / unstyled page | PostCSS not processing `@tailwind` directives | Run `npm run doctor` — check CSS Pipeline section |
| `EADDRINUSE: address already in use 0.0.0.0:3000` | Previous dev server still running | `lsof -ti:3000 \| xargs kill` or use `npm run dev -- -p 3001` |
| Endless "Loading Octavius..." spinner | JS bundle loaded but hydration failed | Check browser console for errors; run `npm run doctor` |
| `Module not found` errors after fresh clone | Dependencies not installed | `npm install && npm run setup` |
| Tailwind classes not applying | Missing PostCSS config or globals.css import | Verify `postcss.config.mjs` exists with `tailwindcss` plugin |

## Architecture

```
octavius/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Main dashboard (view switcher)
│   │   ├── login/                          # Authentication pages
│   │   ├── landing/                        # Marketing landing page
│   │   └── api/                            # ~83 API routes
│   │       ├── auth/                       # Login, register, device approval
│   │       ├── dashboard/                  # Tasks, checkins, journal, connections, goals, profile
│   │       ├── agents/                     # Spawn, active, fleet-status, dispatch, config
│   │       ├── memory/                     # Items, search, graph, annotations, jobs, stats
│   │       ├── lcm/                        # LCM bridge (status, search, conversations)
│   │       ├── obsidian/                   # Sync, status, vault graph
│   │       ├── gateway/                    # Health, provision, tools, workspace-files
│   │       ├── harness/                    # Sessions, traces, policies, evolve, hooks
│   │       ├── health/                     # CSV import, data ingest
│   │       ├── llm-cost/                   # Costs, budgets, alerts, models, timeseries
│   │       ├── chat/                       # Chat, agent-reply, progress
│   │       ├── research/                   # Deep research streaming
│   │       ├── heartbeat/                  # Proactive health checks
│   │       ├── cron/                       # Stale task cleanup
│   │       ├── events/                     # SSE event stream
│   │       ├── models/                     # Available LLM models
│   │       └── settings/                   # Provider API keys
│   ├── components/
│   │   ├── views/                          # 12 view components (one per tab)
│   │   │   ├── DashboardView.tsx           # Balance radar, standup, sprint nav
│   │   │   ├── LifeforceView.tsx           # Health biometrics & charts
│   │   │   ├── IndustryView.tsx            # Kanban board, focus goals, schedule
│   │   │   ├── FellowshipView.tsx          # Connections, overdue alerts
│   │   │   ├── EssenceView.tsx             # Journaling, gratitude
│   │   │   ├── NerveCenterView.tsx         # Agent town (Phaser wrapper + fleet panel)
│   │   │   ├── AgentsView.tsx              # Fleet management, workspace editor
│   │   │   ├── MemoryView.tsx              # Memory browser, LCM, vault graph
│   │   │   ├── CostsView.tsx               # LLM cost tracking
│   │   │   ├── SettingsView.tsx            # System config
│   │   │   ├── ChatView.tsx                # Agent chat
│   │   │   └── GatewayView.tsx             # OpenClaw gateway panel
│   │   ├── layout/                         # Shell, Sidebar, Topbar, types
│   │   ├── town/                           # Phaser game integration
│   │   │   ├── game/
│   │   │   │   ├── PhaserGame.tsx          # React wrapper (dynamic import, SSR disabled)
│   │   │   │   ├── config.ts               # Phaser game config
│   │   │   │   ├── scenes/
│   │   │   │   │   ├── NerveCenterScene.ts # Main scene: rooms, agents, events, camera
│   │   │   │   │   └── room-id-map.ts      # Agent home rooms, room colors
│   │   │   │   ├── entities/
│   │   │   │   │   ├── Agent.ts            # Agent entity: pathfinding, mood, emotes, bubbles
│   │   │   │   │   └── Player.ts           # Player character (WASD movement)
│   │   │   │   ├── config/
│   │   │   │   │   ├── animations.ts       # Spritesheet animation definitions
│   │   │   │   │   ├── emotes.ts           # Emote spritesheet frames
│   │   │   │   │   ├── room-behaviors.ts   # Per-room idle behavior configs
│   │   │   │   │   └── mood.ts             # Mood visual effects (tint, bounce, speed)
│   │   │   │   └── utils/
│   │   │   │       └── MapHelpers.ts       # Sprite frame building
│   │   │   └── hud/
│   │   │       └── TownHud.tsx             # HUD overlay
│   │   ├── health/                         # Biometric charts, CSV upload
│   │   ├── gateway/                        # Gateway connection UI
│   │   └── ui/                             # Shared primitives (buttons, cards, modals)
│   ├── hooks/                              # 13+ custom React hooks
│   │   ├── use-api.ts                      # Data fetching with optimistic updates
│   │   ├── use-auth.ts                     # Session management
│   │   ├── use-active-agents.ts            # Active agent tracking
│   │   ├── use-tasks.ts                    # Task CRUD (Kanban state)
│   │   ├── use-checkins.ts                 # Mood/energy/stress
│   │   ├── use-journal.ts                  # Journal entries
│   │   ├── use-connections.ts              # Relationship tracking
│   │   ├── use-profile.ts                  # User preferences
│   │   ├── use-goals.ts                    # Quadrant goals
│   │   ├── use-focus-goals.ts              # Daily focus (max 3)
│   │   ├── use-gratitude.ts                # Gratitude practice
│   │   ├── use-schedule.ts                 # Daily schedule
│   │   └── use-sprint.ts                   # Sprint/weekly cycle
│   ├── lib/
│   │   ├── memory/                         # Memory Service (SQLite, search, graph, decay)
│   │   │   ├── db.ts                       # Schema, migrations, 25+ tables
│   │   │   ├── service.ts                  # Main CRUD + search API
│   │   │   ├── hybrid-search.ts            # BM25 + vector similarity
│   │   │   ├── embeddings.ts               # Vector embedding generation
│   │   │   ├── graph.ts                    # Knowledge graph operations
│   │   │   ├── decay.ts                    # Spaced repetition scheduler
│   │   │   ├── consolidation.ts            # Memory merge jobs
│   │   │   ├── evolution.ts                # Nightly agent file updates
│   │   │   └── agent-workspace.ts          # SOUL.md, AGENTS.md management
│   │   ├── auth/auth.ts                    # JWT sessions (jose), scrypt, device fingerprinting
│   │   ├── gateway/                        # OpenClaw client, provisioner, orchestrator
│   │   ├── town/                           # Phaser game state
│   │   │   ├── fleet-store.ts              # Singleton FleetStore (sessionStorage)
│   │   │   ├── bot-state-store.ts          # Agent position persistence (sessionStorage)
│   │   │   ├── events.ts                   # Town event bus
│   │   │   ├── constants.ts                # Game physics, interaction distances
│   │   │   ├── use-fleet.ts                # React hook for fleet state
│   │   │   └── use-fleet-sse.ts            # SSE subscription for fleet updates
│   │   ├── agent-spawner.ts                # Agent spawn with context injection
│   │   ├── llm-caller.ts                   # LLM abstraction (OpenRouter -> Bedrock fallback)
│   │   ├── model-catalog.ts                # Model registry and pricing
│   │   ├── models.ts                       # Centralized model ID definitions
│   │   ├── provider-keys.ts                # AES-encrypted API key storage
│   │   ├── cost-tracker.ts                 # LLM cost estimation
│   │   ├── cron-runner.ts                  # Cron jobs (stale recovery, model refresh)
│   │   ├── harness/                        # Execution tracing, policies, tool scopes
│   │   ├── health/                         # CSV parser, biometric normalization
│   │   ├── lcm/                            # Lossless-claw bridge (read-only)
│   │   ├── obsidian/                       # Obsidian vault sync engine
│   │   ├── llm-cost/                       # Cost logs, budgets, alerts
│   │   ├── deep-research/                  # Research agent workflow
│   │   └── chat/                           # Conversation threading
│   └── types/                              # Shared TypeScript definitions
├── e2e/                                    # Playwright E2E tests
├── extensions/
│   ├── openclaw-octavius/                  # OpenClaw plugin (dashboard tools)
│   └── health-data/                        # OpenClaw plugin (health webhooks)
├── public/
│   └── town/                               # Phaser assets (spritesheets, tilesets, UI)
│       ├── characters/                     # 48x96 character PNGs (Premade_Character_*)
│       ├── sprites/                        # Arrow indicators, emote sheets
│       ├── tilesets/                        # Room decoration tiles
│       └── gateway/
│           └── nerve-center-map.logic.json # Room layout manifest (v3)
├── docs/                                   # Design specs, plans, research
└── .env.example
```

### Data Storage

| Data | Where | Persistence |
|------|-------|-------------|
| Dashboard state (tasks, connections, journal) | SQLite `.data/memory.sqlite` | Server-side, local only |
| Health biometrics | SQLite `.data/memory.sqlite` | Server-side, `source_type = 'device_sync'` |
| Agent memories | SQLite `.data/memory.sqlite` | Server-side, various source types |
| LLM cost logs, budgets, alerts | SQLite `.data/memory.sqlite` | Server-side |
| Conversation history (LCM) | SQLite `~/.openclaw/lcm.db` | Persistent, DAG-summarized |
| Agent workspace files | `~/.openclaw/workspace-octavius-*/` | Filesystem |
| Agent file version history | SQLite `agent_context_versions` | Server-side audit trail |
| Execution traces | SQLite `execution_traces` | Server-side, per-agent |
| Town agent positions | Browser `sessionStorage` | Per-session (BotStateStore) |
| Fleet agent status | Browser `sessionStorage` | Per-session (FleetStore) |
| Browser UI state | Browser `localStorage` | Per-browser (ephemeral, syncs to SQLite) |

#### Data privacy: your personal data stays local

All personal data (tasks, journal, health, memories, costs) is stored in a **single SQLite file**:

```
octavius/.data/memory.sqlite
```

This file is in `.gitignore` -- it is **never committed to git** and never leaves your machine. The `.data/` directory is created automatically on first run.

To back up your data, copy this file. To reset, delete it.

To move the database elsewhere, set the `OCTAVIUS_DATA_DIR` environment variable or edit `src/lib/memory/db.ts`.

### Authentication

- Password hashing: scrypt (N=16384, r=8, p=1)
- Sessions: JWT via `jose` library, 30-day expiry
- Device fingerprinting: SHA-256 of (userAgent + IP + screen + timezone)
- Device approval flow with TOTP codes
- Auth is request-scoped in each API route (no global middleware)

### Agent Architecture

```
User message
    |
    v
Octavius Orchestrator
    |
    ├── Quadrant Agents (4 generalists)
    │   ├── agent-lifeforce   → Vitality Lab
    │   ├── agent-industry    → Task Forge
    │   ├── agent-fellowship  → Commons
    │   └── agent-essence     → Soul Workshop
    |
    └── Specialist Agents (9)
        ├── specialist-architect    → Task Forge
        ├── specialist-coder        → Task Forge
        ├── specialist-engineering  → Task Forge
        ├── specialist-research     → Research Lab
        ├── specialist-writing      → Writing Room
        ├── specialist-marketing    → Writing Room
        ├── specialist-video        → Media Studio
        ├── specialist-image        → Media Studio
        └── specialist-n8n          → Automations Bay
```

LLM routing: OpenRouter (default) -> AWS Bedrock (fallback) -> OpenRouter free models (last resort).

Provider API keys are AES-encrypted and stored in the `provider_keys` SQLite table, configurable from the Settings tab.

### Nerve Center (Phaser Game Architecture)

The Nerve Center is a pixel-art virtual office rendered with Phaser 3:

- **Manifest-driven**: Room layout, seats, and walk graph defined in `nerve-center-map.logic.json`
- **10 rooms** arranged in a 2-row grid (1280x720 canvas)
- **Walk graph**: Nodes at room centers + corridor intersections, BFS pathfinding
- **Agent lifecycle**: Spawn at seat position -> wander within room bounds -> navigate to task room -> complete/fail -> return home
- **Mood system**: neutral/happy/stressed/sleeping with tint colors, bounce animations, and speed multipliers
- **State persistence**: `BotStateStore` (positions) + `FleetStore` (status/tasks) both use `sessionStorage`
- **Tab switch continuity**: Scene flushes positions to sessionStorage on shutdown, restores them on re-create
- **Dynamic furniture**: Paper stacks appear in busy rooms, warning glow on overloaded rooms (5+ active agents)
- **Day/night cycle**: Ambient tint overlay based on system clock (morning gold, midday clear, evening amber, night blue)

## Health Data Integration

Three paths to get biometric data from a RingConn smart ring:

### Path 1: CSV Import (works today)
1. Export CSV from the RingConn app (Me -> Settings -> Data Management -> Data Export)
2. Drag-and-drop the file onto the Lifeforce tab
3. Data is parsed, deduplicated, and stored immediately

### Path 2: ROOK SDK (Android, automated)
1. RingConn syncs to Health Connect on your Android device
2. Sign up at [tryrook.io](https://www.tryrook.io/) and configure their SDK
3. Point ROOK webhooks at your OpenClaw gateway: `https://your-gateway/health/rook`
4. Configure the health-data extension in OpenClaw config

### Path 3: Apple Health (iOS, automated)
1. RingConn syncs to Apple Health on your iPhone
2. Install [Health Auto Export](https://apps.apple.com/us/app/health-auto-export-json-csv/id1115567069)
3. Configure a REST API automation pointing at: `https://your-gateway/health/apple`
4. Configure the health-data extension in OpenClaw config

### Health Data Extension Setup (Paths 2 & 3)

Add to your OpenClaw config:

```json
{
  "health-data": {
    "enabled": true,
    "rookWebhookPath": "/health/rook",
    "appleHealthWebhookPath": "/health/apple",
    "webhookSecret": "your-secret-token",
    "octaviusApiUrl": "http://localhost:3000"
  }
}
```

Install the extension:
```bash
# From the octavius repo
openclaw plugin install ./extensions/health-data
```

## Agent Workspace Files

Each agent has Markdown files that define its behavior:

| File | Purpose | Edited by |
|------|---------|-----------|
| SOUL.md | Personality, boundaries, tone | You (orchestrator only) |
| AGENTS.md | Domain instructions, delegation rules | You + Evolution Job |
| USER.md | Your profile, preferences | You + Evolution Job |
| TOOLS.md | Memory API docs | Auto-generated |
| HEARTBEAT.md | Proactive check definitions | Auto-generated |

Files live at `~/.openclaw/workspace-octavius-*/`. Edit them from the dashboard (Agents tab) or directly on disk.

The Evolution Job runs nightly at 4 AM and appends learned behavioral patterns and preferences to AGENTS.md and USER.md. Previous versions are backed up in SQLite. When lossless-claw is installed, the Evolution Job also scans recent LCM conversation summaries for patterns, giving agents richer self-improvement signals.

## Obsidian Integration

Octavius can sync its memory system with an [Obsidian](https://obsidian.md/) vault, giving you a polished markdown editor for browsing and creating memories while Octavius handles the intelligence layer (decay, consolidation, embeddings, agent provenance).

### Setup

1. Install the [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) community plugin in Obsidian
2. Enable it in Settings -> Community Plugins
3. Copy the API key from Settings -> Local REST API
4. In the Octavius dashboard, go to Memory -> Obsidian Integration
5. Enable the toggle, paste the API key, and click Test Connection
6. Click Sync Now

### How it works

- **Push (Memory -> Vault):** Each memory item becomes a `.md` file in your vault's `octavius/` folder with YAML frontmatter containing `memory_id`, `type`, `layer`, `tags`, `confidence`, and `importance`.
- **Pull (Vault -> Memory):** New notes you create in the `octavius/` folder (without a `memory_id` in frontmatter) are imported as memory items. After import, the note is stamped with the assigned `memory_id` to prevent duplicates.
- **Vault Graph:** The Obsidian Vault tab in the Knowledge Graph section visualizes your vault's `[[wikilink]]` structure as a force-directed graph, with nodes color-coded by sync status.

### Sync direction

| Mode | Behavior |
|------|----------|
| Bidirectional | Push new memories to vault + pull new vault notes to memory |
| Push only | Memory -> Vault only (read-only vault) |
| Pull only | Vault -> Memory only (Obsidian as primary editor) |

## Development

```bash
npm run setup         # First-time setup
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm start             # Start production server
npm test              # Run unit tests (Vitest)
npm run lint          # Lint
npx playwright test   # Run E2E tests (requires dev server)
```

### E2E Tests

Playwright tests live in `e2e/`:

| Test | What it covers |
|------|----------------|
| `auth-flow.spec.ts` | Login redirect, registration, device approval |
| `views-load.spec.ts` | Page loads, API health checks |
| `onboarding.spec.ts` | Wizard steps for new users |
| `landing.spec.ts` | Landing page rendering |
| `approval-buttons.spec.ts` | Subtask approval gates |
| `kanban-realtime.spec.ts` | Kanban board real-time updates |
| `nerve-center-agents.spec.ts` | Agent initial positions, tab switch persistence |

### Database Schema (25+ tables)

Core tables in `.data/memory.sqlite`:
- `memory_items` -- Main memory storage with FTS5 full-text search
- `memory_edges` -- Knowledge graph relationships
- `memory_embeddings` -- Vector embeddings (BLOB)
- `dashboard_tasks`, `dashboard_checkins`, `dashboard_journal`, `dashboard_connections` -- Quadrant data
- `dashboard_focus_goals`, `dashboard_goals`, `dashboard_gratitude`, `dashboard_schedule` -- Daily planning
- `dashboard_profile` -- User preferences (KV store)
- `agent_model_config` -- Agent -> model routing
- `agent_context_versions` -- Evolution audit trail
- `execution_traces` -- Agent execution logs (outcome, tokens, cost, tool calls)
- `scheduled_agent_jobs` -- Cron job definitions
- `heartbeat_actions`, `heartbeat_config`, `heartbeat_runs` -- Proactive checks
- `provider_keys` -- AES-encrypted API keys
- `gateway_tokens`, `gateway_events` -- Gateway session management

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 3.4 |
| UI Components | Radix UI (Dialog, Tabs) |
| Charts | Recharts 3.7 |
| Animations | Framer Motion 12 |
| Game Engine | Phaser 3.90 |
| Database | better-sqlite3 (WAL mode) |
| Auth | jose (JWT), scrypt |
| Drag-and-Drop | @dnd-kit |
| Knowledge Graph | react-force-graph-2d |
| Command Palette | cmdk |
| WebSocket | ws |
| Cron | node-cron |
| Testing (unit) | Vitest 4.0 |
| Testing (E2E) | Playwright 1.58 |
| AI Gateway | OpenClaw |
| Conversation Memory | lossless-claw |
| LLM Providers | OpenRouter, AWS Bedrock |

## License

MIT
