# Octavius Plugin for OpenClaw

Connects your OpenClaw AI agent to the [Octavius](https://github.com/wabecerra/octavius) life dashboard. Once installed, your agent can create tasks, log wellness check-ins, write journal entries, track goals, and search your life memory — all automatically.

## Install

### From the Octavius repo (recommended)

```bash
# Clone Octavius if you haven't already
git clone https://github.com/wabecerra/octavius.git
cd octavius

# Install the plugin into OpenClaw
openclaw plugins install ./extensions/openclaw-octavius
```

### Enable in OpenClaw config

The plugin auto-detects Octavius at `http://localhost:3000`. If you need custom settings:

```json5
// ~/.openclaw/openclaw.json
{
  plugins: {
    entries: {
      octavius: {
        enabled: true,
        config: {
          url: "http://localhost:3000",    // default
          // apiSecret: "your-token"       // only needed if OCTAVIUS_API_SECRET is set
        }
      }
    }
  }
}
```

Restart the gateway after config changes.

## What it adds

### Agent Tools

| Tool | What it does |
|------|-------------|
| `octavius_tasks_list` | List tasks from the kanban board (filter by status/priority) |
| `octavius_task_create` | Create a new task (title, priority, status, due date) |
| `octavius_task_update` | Move tasks across kanban columns or mark complete |
| `octavius_checkin` | Log a wellness check-in (mood/energy/stress 1-5) |
| `octavius_journal` | Write a journal entry |
| `octavius_goal_create` | Create a goal in any life quadrant |
| `octavius_memory_search` | Search the hybrid memory system (FTS5 + semantic) |
| `octavius_memory_store` | Store a memory/learning/insight |

### System Context

The plugin injects a brief system context telling the agent about available Octavius tools. This means your agent will naturally use the dashboard when relevant — no manual prompting needed.

## Example Interactions

Once installed, your agent will automatically:

- **"Create a task to review the quarterly report"** → creates on the kanban board
- **"How am I feeling this week?"** → searches wellness check-ins
- **"I just had a great meeting with Sarah"** → logs it as a journal entry + fellowship memory
- **"What were my goals last month?"** → searches goal memories

## Requirements

- Octavius dashboard running (`npm run dev` in the octavius repo)
- OpenClaw gateway running
- That's it. No auth needed for local installs.

## Full Setup (from scratch)

```bash
# 1. Install OpenClaw (if not already)
npm i -g openclaw

# 2. Clone and start Octavius
git clone https://github.com/wabecerra/octavius.git
cd octavius
npm run setup
npm run dev                    # runs on http://localhost:3000

# 3. Install the plugin (in another terminal)
openclaw plugins install ./extensions/openclaw-octavius

# 4. Restart the gateway
openclaw gateway restart

# 5. Done! Your agent now has Octavius tools.
```

## Architecture

```
┌─────────────┐     HTTP/JSON      ┌─────────────────────┐
│  OpenClaw   │ ◄────────────────► │  Octavius Dashboard  │
│   Agent     │   octavius_* tools │  (Next.js + SQLite)  │
│             │                    │                      │
│  Plugin:    │                    │  /api/dashboard/*    │
│  octavius   │                    │  /api/memory/*       │
└─────────────┘                    └─────────────────────┘
```

The plugin makes HTTP calls to the Octavius API. All data lives in Octavius's SQLite database. Nothing is stored in OpenClaw.

## License

MIT
