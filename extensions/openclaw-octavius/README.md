# Octavius Plugin for OpenClaw

Connects your OpenClaw AI agent to the [Octavius](https://github.com/wabecerra/octavius) life dashboard. Once installed, your agent gets **42 tools** to manage your entire life operating system — or it can use **1 discovery tool** to find exactly what it needs.

## Install

```bash
# From the Octavius repo
git clone https://github.com/wabecerra/octavius.git
cd octavius
openclaw plugins install ./extensions/openclaw-octavius
openclaw gateway restart
```

Zero config for local installs. The plugin auto-detects Octavius at `http://localhost:3000`.

## The Meta Tool — `octavius_discover`

Instead of loading all 42 tools into context, your agent can use ONE discovery tool:

```
Agent: octavius_discover("how do I track wellness?")

→ Found 3 matching tools:
  1. octavius_checkin [dashboard] — Log mood/energy/stress (1-5)
  2. octavius_checkins_list [dashboard] — List past check-ins for trends
  3. octavius_memory_search [memory] — Search health memories
```

The agent discovers what's available, then calls the specific tools. This keeps context lean.

## Tool Categories

### Dashboard (22 tools)

| Tool | What it does |
|------|-------------|
| `octavius_tasks_list` | List kanban tasks (filter by status/priority) |
| `octavius_task_create` | Create task on kanban board |
| `octavius_task_update` | Move task across columns, update details |
| `octavius_task_delete` | Delete a task |
| `octavius_checkin` | Log wellness check-in (mood/energy/stress) |
| `octavius_checkins_list` | List past check-ins for trends |
| `octavius_journal` | Write journal entry |
| `octavius_journal_list` | List past journal entries |
| `octavius_goal_create` | Create goal in any quadrant |
| `octavius_goals_list` | List goals (filter by quadrant) |
| `octavius_goal_update` | Update goal progress |
| `octavius_connections_list` | List tracked relationships |
| `octavius_connection_create` | Add a relationship |
| `octavius_connection_update` | Update last contact, reminders |
| `octavius_gratitude_create` | Log gratitude items |
| `octavius_gratitude_list` | List past gratitude entries |
| `octavius_focus_goals_set` | Set daily focus goals (max 3) |
| `octavius_schedule_add` | Add to daily schedule |
| `octavius_schedule_toggle` | Mark schedule item done |
| `octavius_profile_get` | Read user profile |
| `octavius_profile_update` | Update profile fields |
| `octavius_weekly_review` | Create weekly review |

### Memory / QMD (10 tools)

| Tool | What it does |
|------|-------------|
| `octavius_memory_search` | FTS5 full-text search |
| `octavius_memory_context` | Hybrid search (FTS5 + semantic + RRF fusion) |
| `octavius_memory_store` | Store memory/learning/insight |
| `octavius_memory_update` | Update existing memory |
| `octavius_memory_delete` | Delete/archive memory |
| `octavius_memory_graph_traverse` | Walk the knowledge graph |
| `octavius_memory_graph_link` | Create edges between memories |
| `octavius_memory_graph_export` | Export full knowledge graph |
| `octavius_memory_consolidate` | Trigger daily note consolidation |
| `octavius_memory_evolve` | Trigger evolution (pattern extraction) |
| `octavius_memory_config` | Get/set memory system config |

### Agent Fleet (4 tools)

| Tool | What it does |
|------|-------------|
| `octavius_agents_provision` | Deploy all 11 agent workspaces |
| `octavius_agents_workspace_read` | Read agent's SOUL.md, AGENTS.md, etc. |
| `octavius_agents_workspace_write` | Update agent workspace files |
| `octavius_agents_delegate` | Delegate task to specific agent |

**Agent Fleet:**
- 4 Generalists: Lifeforce, Industry, Fellowship, Essence
- 6 Specialists: Research, Engineering, Marketing, Video, Image, Writing
- 1 Orchestrator: routes tasks to the right agent

### Health (2 tools)

| Tool | What it does |
|------|-------------|
| `octavius_health_import` | Import biometric CSV data |
| `octavius_health_ingest` | Ingest ROOK/Apple Health readings |

### System (2 tools)

| Tool | What it does |
|------|-------------|
| `octavius_gateway_status` | Check OpenClaw gateway connection |
| `octavius_jobs_list` | List background job history |

## Architecture

```
┌─────────────────┐
│    OpenClaw      │
│    Agent         │
│                  │
│  octavius_       │     HTTP/JSON     ┌──────────────────────┐
│  discover ──────────────────────────►│  Octavius Dashboard  │
│  octavius_       │                   │  (Next.js + SQLite)  │
│  task_create ───────────────────────►│                      │
│  octavius_       │                   │  /api/dashboard/*    │
│  memory_search ─────────────────────►│  /api/memory/*       │
│  ...42 tools     │                   │  /api/gateway/*      │
└─────────────────┘                    └──────────────────────┘
                                              │
                                        SQLite (WAL mode)
                                        ├── dashboard_*
                                        ├── memory_items (FTS5)
                                        ├── memory_edges (graph)
                                        └── memory_embeddings
```

## Optional Config

```json5
// ~/.openclaw/openclaw.json
{
  plugins: {
    entries: {
      octavius: {
        enabled: true,
        config: {
          url: "http://localhost:3000",
          // apiSecret: "only-if-OCTAVIUS_API_SECRET-is-set"
        }
      }
    }
  }
}
```

## License

MIT
