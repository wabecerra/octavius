# Octavius — Personal Life Operating System

A self-hosted dashboard that orchestrates four life quadrants through AI agents. Built with Next.js, SQLite, and [OpenClaw](https://github.com/openclaw/openclaw).

## What is Octavius?

Octavius splits your life into four quadrants, each managed by a dedicated AI agent:

| Quadrant | Agent | What it does |
|----------|-------|-------------|
| Lifeforce | agent-lifeforce | Health, biometrics, sleep, fitness, nutrition |
| Industry | agent-industry | Tasks, projects, focus goals, productivity |
| Fellowship | agent-fellowship | Relationships, social connections, contact tracking |
| Essence | agent-essence | Journaling, gratitude, reflection, meaning |

An orchestrator agent (`octavius-orchestrator`) routes your messages to the right quadrant agent or specialist (research, engineering, marketing, video, image, writing).

## Quick Start

### Prerequisites

- Node.js 22+

### 1. Clone and install

```bash
git clone https://github.com/wabecerra/octavius.git
cd octavius
npm run setup
```

The setup script will:
- Create `.env.local` with sensible defaults
- Set up the SQLite data directory
- Detect if an OpenClaw gateway is running
- Install lossless-claw plugin if a gateway is detected
- Install dependencies if needed

### 2. Start the dashboard

```bash
npm run dev
```

Open http://localhost:3000.

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

The setup script automatically installs [lossless-claw](https://github.com/Martian-Engineering/lossless-claw) when a gateway is detected. This gives all Octavius agents persistent conversation memory — they never lose context, even in long conversations.

If it wasn't auto-installed, add it manually:

```bash
openclaw plugins install @martian-engineering/lossless-claw
```

When you click "Provision Agents" in Settings, the OpenClaw config is automatically generated with optimal lossless-claw settings:
- `freshTailCount: 32` — protects the last 32 messages from compaction
- `incrementalMaxDepth: -1` — unlimited DAG condensation depth
- `contextThreshold: 0.75` — triggers compaction at 75% of context window
- Cron sessions are excluded from LCM storage (noise reduction)
- Sub-agent sessions are stateless (read-only access to LCM)
- Session idle timeout set to 7 days (LCM handles context persistence)

The Memory tab in the dashboard shows LCM status, conversation count, summary DAG depth, and lets you browse stored conversations.

Optionally, connect the dashboard UI to the gateway:
1. Go to Settings → Gateway Connection
2. Enter `localhost` and port `18789`
3. Click "Provision Agents" — this writes agent workspace files to `~/.openclaw/`
4. Go to Agents tab → Agent Workspace Files → edit the Markdown files with your personal info

## Features

### Dashboard
- Quadrant balance radar chart
- Weekly review prompts
- Compound loop phase tracking (Plan → Work → Review → Compound)

### Lifeforce (Health)
- RingConn smart ring CSV import (drag-and-drop)
- Heart rate, HRV, SpO2, sleep stages, and activity charts
- Date range filtering (7d, 30d, 90d, custom)
- Automated sync via ROOK SDK (Android) or Health Auto Export (iOS) webhooks

### Industry (Career)
- Kanban task board (backlog → in progress → done)
- Daily focus goals (max 3)
- Daily schedule planner

### Fellowship (Relationships)
- Connection tracking with contact frequency
- Overdue connection alerts
- Activity logging

### Essence (Soul)
- Journaling with auto-save
- Gratitude practice (1-3 items)
- Mood trend charts

### Agents
- Agent fleet overview (generalists + specialists)
- Task delegation and tracking
- Agent workspace file editor (SOUL.md, AGENTS.md, USER.md, TOOLS.md)
- Nightly Evolution Job updates agent files with learned patterns

### Settings
- Profile and preferences
- Model router configuration (local + cloud tiers)
- Cost tracking and budget
- Gateway connection management
- Scheduled jobs and heartbeat actions
- Memory configuration

### Lossless Context (LCM)
- Persistent conversation memory across all agent sessions via [lossless-claw](https://github.com/Martian-Engineering/lossless-claw)
- DAG-based summarization — nothing is ever lost from conversations
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

## Architecture

```
octavius/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard UI
│   │   └── api/
│   │       ├── health/import/          # CSV upload endpoint
│   │       ├── health/ingest/          # Health data ingest (dedup + store)
│   │       ├── memory/                 # Memory Service API
│   │       ├── lcm/                    # LCM bridge (status, search, conversations)
│   │       ├── obsidian/               # Obsidian sync, status, vault graph
│   │       └── gateway/                # Gateway integration
│   ├── components/
│   │   └── health/                     # Biometric charts, CSV upload
│   ├── lib/
│   │   ├── health/                     # Types, normalizer, CSV parser, dedup
│   │   ├── memory/                     # SQLite Memory Service, sync layer, evolution
│   │   ├── lcm/                        # Read-only bridge to lossless-claw SQLite DB
│   │   ├── obsidian/                   # Obsidian REST API client, sync engine
│   │   └── gateway/                    # Client, provisioner, orchestrator, dispatcher
│   ├── store/                          # Zustand (localStorage + Memory Service sync)
│   └── types/                          # TypeScript definitions
├── extensions/
│   └── health-data/                    # OpenClaw plugin for health webhooks
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
| Browser UI state | Browser localStorage | Per-browser (ephemeral, syncs to SQLite) |

#### ⚠️ Data privacy: your personal data stays local

All personal data (tasks, journal, health, memories, costs) is stored in a **single SQLite file**:

```
octavius/.data/memory.sqlite
```

This file is in `.gitignore` — it is **never committed to git** and never leaves your machine. The `.data/` directory is created automatically on first run.

To back up your data, copy this file. To reset, delete it.

To move the database elsewhere, set the `OCTAVIUS_DATA_DIR` environment variable or edit `src/lib/memory/db.ts`.

## Health Data Integration

Three paths to get biometric data from a RingConn smart ring:

### Path 1: CSV Import (works today)
1. Export CSV from the RingConn app (Me → Settings → Data Management → Data Export)
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
2. Enable it in Settings → Community Plugins
3. Copy the API key from Settings → Local REST API
4. In the Octavius dashboard, go to Memory → Obsidian Integration
5. Enable the toggle, paste the API key, and click Test Connection
6. Click Sync Now

### How it works

- **Push (Memory → Vault):** Each memory item becomes a `.md` file in your vault's `octavius/` folder with YAML frontmatter containing `memory_id`, `type`, `layer`, `tags`, `confidence`, and `importance`.
- **Pull (Vault → Memory):** New notes you create in the `octavius/` folder (without a `memory_id` in frontmatter) are imported as memory items. After import, the note is stamped with the assigned `memory_id` to prevent duplicates.
- **Vault Graph:** The Obsidian Vault tab in the Knowledge Graph section visualizes your vault's `[[wikilink]]` structure as a force-directed graph, with nodes color-coded by sync status.

### Sync direction

| Mode | Behavior |
|------|----------|
| Bidirectional | Push new memories to vault + pull new vault notes to memory |
| Push only | Memory → Vault only (read-only vault) |
| Pull only | Vault → Memory only (Obsidian as primary editor) |

## Development

```bash
npm run setup         # First-time setup
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm start             # Start production server
npm test              # Run tests
npm run lint          # Lint
```

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Radix UI (Tabs, Dialog)
- Recharts (charts)
- Zustand (state management)
- better-sqlite3 (Memory Service)
- OpenClaw (AI agent gateway)
- lossless-claw (persistent conversation memory)

## License

MIT
# octavius
