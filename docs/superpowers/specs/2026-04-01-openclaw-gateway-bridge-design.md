# OpenClaw Gateway Bridge — Full Integration Design Spec

**Date:** 2026-04-01
**Status:** Draft
**Scope:** Replace CLI shell-out and embedded fallback with native WebSocket RPC integration between Octavius and OpenClaw gateway, enabling streaming chat, real-time Nerve Center updates, orchestrator cascade with parallel specialists, approval gates, and slash commands.

---

## 1. Architecture Overview

### 1.1 Core Component: GatewayBridge Singleton

A server-side singleton in the Next.js process that maintains a persistent WebSocket connection to the OpenClaw gateway (port 18789). All API routes share this connection.

**Responsibilities:**
- Persistent WS connection with auto-reconnect (exponential backoff, max 30s)
- Send `agent` RPC calls for chat messages
- Subscribe to all agent/chat events and broadcast them internally via `EventEmitter`
- Track active sessions (orchestrator + sub-agents) with lifecycle state
- Log all activity to `task_activity_log` in real-time
- Translate gateway events into Octavius `AgentEvent` format for SSE streaming

**Location:** `src/lib/gateway/bridge.ts`

**Relationship to existing code:**
- **Replaces** `src/lib/gateway/server-client.ts` (HTTP-only singleton that calls broken REST endpoints)
- **Reuses types/patterns from** `src/lib/town/ws-gateway.ts` — specifically `GatewayFrame` interface, `handleFrame` dispatch, `sendHandshake` sequence, and pending-request map pattern. However, `WsGatewayClient` is browser-only (uses `new WebSocket()` browser API, `window.location`). The bridge must use the `ws` npm package for Node.js. The transport layer is reimplemented; the frame protocol and handshake logic are adapted.
- **Deprecates** `src/lib/gateway/client.ts` for server-side use (keep for browser-side health checks only)
- **Deprecates** `src/lib/gateway/dispatcher.ts` (TaskDispatcher assumed REST `/api/sessions/spawn` which doesn't exist)
- **Deprecates** `src/lib/gateway/orchestrator-router.ts` (routing now handled by OpenClaw orchestrator agent, not Octavius code)

**Dependencies:**
- OpenClaw gateway running on `localhost:18789` (configurable via `OPENCLAW_HOST`, `OPENCLAW_PORT` env)
- Auth token: `OPENCLAW_TOKEN` or `openclaw-local-dev` default
- Feature flag: `ENABLE_WS_BRIDGE=true` (default true; set false to fall back to CLI during development)

### 1.2 System Diagram

```
Browser                          Next.js Server (:3000)                   OpenClaw (:18789)
┌──────────┐                    ┌──────────────────────┐                ┌──────────────────┐
│ChatPanel │──POST /api/chat───>│ Chat Route           │                │                  │
│          │<──SSE stream───────│ (returns EventStream) │                │  Main Agent      │
└──────────┘                    │         │             │                │  (orchestrator)  │
┌──────────┐                    │         ▼             │    WS RPC     │       │          │
│NerveCenter│<─SSE /api/events─>│  GatewayBridge       │<──────────────>│  Subagent Lane   │
│          │   /stream          │  (singleton)          │   agent,      │  (max 8)         │
└──────────┘                    │  - EventEmitter       │   chat events │       │          │
                                │  - Session tracker    │               │  46 Octavius     │
                                │  - Activity logger    │               │  Plugin Tools    │
                                └──────────────────────┘                └──────────────────┘
```

### 1.3 Connection Lifecycle

```
UNKNOWN ──(first connect attempt)──> CONNECTING
CONNECTING ──(handshake ok)──> CONNECTED
CONNECTING ──(auth rejected)──> AUTH_FAILED
CONNECTING ──(timeout/error)──> DISCONNECTED
CONNECTED ──(3 consecutive health failures)──> DISCONNECTED
CONNECTED ──(401 response)──> AUTH_FAILED
AUTH_FAILED ──(token updated)──> CONNECTING
DISCONNECTED ──(reconnect backoff)──> CONNECTING
```

Reconnect uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max). Resets on successful connection.

Handshake follows OpenClaw protocol v3:
1. Gateway sends `{ type: 'event', event: 'connect.challenge', payload: { nonce } }` immediately on WS open
2. Bridge responds with `{ type: 'req', id, method: 'connect', params: { token, minProtocol: 3, maxProtocol: 3, client: { id: 'octavius-bridge', version, platform: 'node', mode: 'rpc' } } }` — `mode: 'rpc'` signals the bridge wants full agentic capabilities (vs `mode: 'backend'` used by the Town WS client which only needs game events)
3. Gateway responds with `{ type: 'res', id, ok: true, payload: { features, snapshot, methods } }`

### 1.4 WebSocket RPC Frame Format

```typescript
// Request (Octavius → Gateway)
{ type: 'req', id: '<uuid>', method: 'agent', params: {
    message: string,
    agentId?: string,          // default: 'main'
    sessionKey?: string,       // default: 'agent:main'
    thinking?: 'medium',       // extended thinking level
    timeout?: 600,             // seconds
    idempotencyKey: '<uuid>',  // dedupe key
}}

// Response (Gateway → Octavius)
{ type: 'res', id: '<uuid>', ok: true, payload: {
    runId: string,
    status: 'ok' | 'error',
    summary: string,
    result: { payloads: [{ type: 'text', text: string }] }
}}

// Streaming events (Gateway → Octavius, during agent execution)
{ type: 'event', event: 'chat', payload: {
    state: 'delta' | 'final' | 'error' | 'aborted',
    text?: string,             // for delta
    runId: string,
    sessionId: string,
}}

// Agent lifecycle events
{ type: 'event', event: 'agent', payload: {
    phase: 'start' | 'end' | 'error',
    runId: string,
    agentId: string,
    sessionKey: string,
}}
```

---

## 2. Orchestration Cascade

### 2.1 Delegation Chain

```
User message in chat
    ↓
GatewayBridge → "agent" RPC to orchestrator (agent:main)
    ↓
Orchestrator decides:
    ├─ Simple query → use tools directly → respond
    ├─ Single-quadrant → sessions_spawn ONE generalist
    └─ Multi-quadrant → sessions_spawn MULTIPLE generalists (parallel)
         ↓
Generalist receives task
    ├─ Can handle alone → use tools → complete → announce to orchestrator
    └─ Needs specialist → sessions_spawn specialist(s) (parallel ok)
         ↓
Specialist(s) execute → complete → announce to generalist → announce to orchestrator
    ↓
Orchestrator synthesizes → responds in chat
```

### 2.2 Concurrency Model

Leverages OpenClaw's native lane system:
- **Main lane** (max 1): Orchestrator holds the conversation
- **Subagent lane** (max 8): Generalists and specialists run here
- Queue managed by gateway — if all 8 slots full, additional spawns wait

### 2.3 Agent Identity — Canonical Naming

The codebase has inconsistent naming. This spec establishes canonical IDs:

| Agent | Canonical ID (fleet-store) | OpenClaw Session Key | Legacy IDs (to migrate) |
|---|---|---|---|
| Orchestrator | `orchestrator` | `agent:main` | — |
| gen-lifeforce | `gen-lifeforce` | `subagent:gen-lifeforce` | `agent-lifeforce` (orchestrator-router.ts) |
| gen-industry | `gen-industry` | `subagent:gen-industry` | `agent-industry` |
| gen-fellowship | `gen-fellowship` | `subagent:gen-fellowship` | `agent-fellowship` |
| gen-essence | `gen-essence` | `subagent:gen-essence` | `agent-essence` |
| specialist-architect | `specialist-architect` | `subagent:specialist-architect-{taskId}` | — |
| specialist-coder | `specialist-coder` | `subagent:specialist-coder-{taskId}` | — |
| specialist-research | `specialist-research` | `subagent:specialist-research-{taskId}` | — |
| specialist-* | `specialist-{type}` | `subagent:specialist-{type}-{taskId}` | — |

**Migration:** `orchestrator-router.ts` and `dispatcher.ts` are deprecated. The `QUADRANT_AGENTS` map in orchestrator-router and the `agent-*` naming convention are replaced by OpenClaw's native sub-agent routing. The GatewayBridge maps between canonical fleet IDs and OpenClaw session keys.

### 2.4 Approval Modes

Configurable per-task via chat command or task metadata:

| Mode | Behavior |
|---|---|
| `auto` | No gates. Full cascade without pause. |
| `spec-review` | Architect spec → user approval → coder implements. |
| `always-ask` | Agent pauses at every delegation point for confirmation. |

Orchestrator SOUL.md instructs it to check task's `approvalMode` field and either proceed or pause with a clarifying question in chat.

### 2.5 Clarifying Questions

When an agent needs input, it calls `octavius_chat_reply` (new plugin tool):

```
Specialist (OpenClaw)          Octavius API           ChatPanel (Browser)         User
       │                           │                        │                      │
       ├── octavius_chat_reply ───>│                        │                      │
       │   { question, taskId,     │                        │                      │
       │     sessionKey }          │                        │                      │
       │                           ├── SSE event ──────────>│                      │
       │                           │   agent.approval_needed│                      │
       │                           │                        ├── render prompt ─────>│
       │                           │                        │                      │
       │                           │                        │<── user types reply ──┤
       │                           │<── POST /api/chat ─────┤                      │
       │                           │    { reply, replyTo:   │                      │
       │                           │      sessionKey }      │                      │
       │<── agent RPC (routed) ────┤                        │                      │
       │   user response injected  │                        │                      │
       │   into agent session      │                        │                      │
```

The tool returns synchronously to the calling agent with the user's reply. On timeout (default 5 min, configurable via `timeout` param), returns `{ status: 'timeout', message: 'User did not respond within 5 minutes' }` — the agent's SOUL.md instructs it to proceed with a safe default or abort gracefully on timeout.

### 2.6 Concurrent Chat Messages

Only one `agent` RPC to the orchestrator (`agent:main`) is active at a time. If the user sends a new message while the orchestrator is busy:
- The message is queued in a local FIFO buffer (max 10 messages)
- If the buffer is full (11th message), the request is rejected with HTTP 429 and ChatPanel shows "Too many queued messages — please wait"
- ChatPanel shows "Agent is busy — your message is queued (position N)"
- When the current run completes, the next queued message is dispatched automatically
- If the user sends `/stop`, the current run is aborted and the queue is flushed

---

## 3. Context & Memory Architecture

### 3.1 Four Memory Layers

```
Layer 4: OpenClaw Session Context (ephemeral, per-session JSONL)
Layer 3: LosslessClaw / LCM (persistent conversation DAG, ~/.openclaw/lcm.db)
Layer 2: QMD Memory System (structured knowledge, .data/memory.sqlite)
Layer 1: Obsidian Vault (human-readable markdown, bidirectional sync)
```

### 3.2 Context Isolation

Each agent gets its own OpenClaw session:
- Orchestrator `agent:main` — full chat conversation
- Generalists `subagent:gen-*` — only their quadrant's work
- Specialists `subagent:specialist-*-taskId` — only their specific task

Sub-agent sessions are isolated. The orchestrator sees announcements (summaries), not full context.

### 3.3 Context Growth Management

| Scenario | Mitigation |
|---|---|
| Long chat (4-6 hours) | OpenClaw auto-compaction (AI-powered summaries) |
| Heavy multi-quadrant day | Sub-agents isolated; orchestrator sees summaries only |
| Large tool output | Tool result guard truncates; full output in QMD |
| Need compacted detail | `octavius_lcm_search` across all sessions |
| Context exhausted | `context_overflow` error; LCM preserves all history |

### 3.4 Three-Way Knowledge Flow

```
OpenClaw Session → (compaction) → LCM DAG
LCM DAG → (nightly autoImportLCM) → QMD Memory
QMD Memory → (nightly scheduleObsidianExport) → Obsidian Vault
QMD + LCM → (4 AM evolution job) → Agent Workspace Files (AGENTS.md, USER.md)
Workspace Files → (loaded on next session) → OpenClaw Session
```

Continuous learning loop: today's patterns become tomorrow's agent instructions.

---

## 4. Real-Time Nerve Center

### 4.1 Event Translation

GatewayBridge translates OpenClaw events into Octavius `AgentEvent` format:

| Gateway Event | AgentEvent | Fleet Action |
|---|---|---|
| `agent` lifecycle `start` | `agent.started` | Set status `running` |
| `chat` delta | `agent.streaming` | Show typing indicator |
| Tool call begin | `agent.tool_call` | Show tool name in feed |
| Tool call result | `agent.tool_result` | Update feed with summary |
| Subagent spawned | `agent.spawned` | Create specialist instance |
| `agent` lifecycle `end` | `agent.completed` | Set `done`; generalists → `idle` after 4s, specialists → removed after 10s |
| `agent` lifecycle `error` | `agent.failed` | Set `failed`; generalists → `idle` after 4s, specialists → removed after 10s |
| Approval requested | `agent.approval_needed` | Show badge + chat prompt |

### 4.2 SSE Endpoint

`GET /api/events/stream` — Server-Sent Events:
- Subscribes to GatewayBridge event emitter
- Pushes all `AgentEvent` types to connected browsers
- Multiple browser tabs can subscribe simultaneously
- Heartbeat every 30s to keep connection alive
- Fallback: existing 10s polling via `useFleetActivitySync` if SSE disconnects
- **Auth:** Validates `octavius_session` JWT from cookie (same auth as other API routes). Rejects with 401 if missing/expired. No token in query string to avoid URL logging exposure.
- **Wire format:** Uses named SSE events matching `AgentEvent` types:
  ```
  event: agent.streaming
  data: {"agentId":"gen-industry","text":"Analyzing...","runId":"abc-123"}

  event: agent.completed
  data: {"agentId":"gen-industry","runId":"abc-123","duration":4200}

  :heartbeat
  ```

### 4.3 Dynamic Specialist Instances

Replace hardcoded `DEFAULT_AGENTS` array with template-based system:

```typescript
interface AgentTemplate {
  type: string           // e.g. 'specialist-coder'
  icon: string
  room: string
  maxInstances: number   // 4 for specialists, 1 for generalists
}

interface AgentInstance {
  id: string             // 'specialist-coder:taskId' for instances
  type: string           // matches template type
  status: SeatStatus
  currentTask?: string
  currentTaskId?: string
  spawnedAt?: string
}
```

Generalists are permanent (always visible in rooms). Specialist instances appear when spawned, disappear when done (after 10s cooldown to show completion status).

**State location:** Fleet store moves from client-only (sessionStorage) to **server-authoritative**. The GatewayBridge maintains the canonical agent state map. The SSE stream pushes diffs to browser clients. `useFleetSSE` hook replaces the client-side `FleetStore` singleton for state reads. This ensures all browser tabs see the same state, and page refresh doesn't lose agent visibility.

### 4.4 Room Rendering

Rooms match agents by type, not by hardcoded ID list:

```typescript
const roomAgents = allAgents.filter(a =>
  room.permanentAgents.includes(a.id) ||
  room.specialistTypes?.includes(a.type)
)
```

### 4.5 Live Stats Bar

```
🟢 3 active  ·  💤 9 idle  ·  ⏳ 1 awaiting approval  ·  📊 $0.42 today
```

Derived from fleet store state. Updated on every event.

---

## 5. Chat Integration

### 5.1 Streaming Chat Route

`POST /api/chat` becomes an SSE endpoint:

1. Parse message + optional command prefix
2. If slash command → handle locally (see Section 6)
3. Check `ENABLE_WS_BRIDGE` feature flag and bridge connection status:
   ```
   if (ENABLE_WS_BRIDGE && bridge.status === 'CONNECTED') {
     // Primary: WebSocket streaming
     bridge.sendAgent({ message, sessionKey: 'agent:main', timeout: 600 })
     → return SSE stream with events: delta, tool, done, error
   } else if (ENABLE_WS_BRIDGE) {
     // Bridge enabled but disconnected: try CLI fallback
     exec(`openclaw agent ...`) → return JSON response (no streaming)
   } else {
     // Bridge disabled: existing CLI path (Phase 1 behavior)
     exec(`openclaw agent ...`) → return JSON response
   }
   ```
4. ChatPanel detects response type (SSE vs JSON) and renders accordingly
5. In Phase 3, the CLI fallback paths are removed

### 5.2 ChatPanel Changes

- Replace fetch+JSON with `EventSource` for streaming
- Show typing indicator during `delta` events
- Show tool call badges during `tool` events
- Show approval prompts on `agent.approval_needed` events
- Gateway status indicator: green (connected), yellow (degraded), red (disconnected)

### 5.3 Session Persistence

Chat history stored in OpenClaw sessions (`~/.openclaw/agents/main/sessions/`), not sessionStorage. Survives page refresh and browser restart. LCM captures everything for long-term recall.

---

## 6. Octavius Slash Commands

Parsed in the chat route before gateway dispatch:

| Command | Implementation | Response |
|---|---|---|
| `/reset` | `bridge.call('sessions.reset', { sessionKey: 'agent:main' })` | "Session reset. Your history is preserved in memory." |
| `/compact` | `bridge.call('sessions.compact', { sessionKey: 'agent:main' })` | "Context compacted. {before}→{after} tokens." |
| `/recall <query>` | `octavius_lcm_search` + `octavius_memory_context` combined | Formatted results injected into chat |
| `/status` | Local fleet state + bridge connection info + DB query | Context %, agents, costs, memory stats |
| `/agents` | Fleet store snapshot | Table of all agents with status |
| `/approve [id]` | PATCH subtask status + log activity | "Approved. Agent resuming." |
| `/reject [id]` | PATCH subtask status + log activity | "Rejected. Agent notified." |
| `/mode <mode>` | Update config in SQLite | "Approval mode set to {mode}." |
| `/stop [sessionKey]` | Abort orchestrator + all active sub-agents (cascade). If sessionKey provided, stop only that agent. Uses `bridge.call('chat.abort', { sessionKey })` per session. | "Stopped N agent(s). Partial results preserved." |
| `/cost [period]` | Query llm_cost_logs | Formatted cost breakdown |
| `/history` | `bridge.call('sessions.list')` | Recent sessions with token usage |

---

## 7. Plugin Additions

New tools added to `extensions/openclaw-octavius/index.ts`:

| Tool | Purpose |
|---|---|
| `octavius_chat_reply` | Agent posts a message/question back to ChatPanel |
| `octavius_agent_status` | Query live fleet state (running/idle counts) |
| `octavius_cost_summary` | Query LLM spend for a time period |
| `octavius_task_dispatch` | Create task + dispatch agent in one call |
| `octavius_approval_check` | Check if a subtask needs/has user approval |

---

## 8. Error Handling & Degradation

### 8.1 Degradation Cascade

```
Level 0: Full capability (WS connected, streaming, tools, real-time Nerve Center)
Level 1: WS disconnected → CLI shell-out fallback (blocking, no streaming)
Level 2: CLI unavailable → embedded intent classifier + spawnAgent
Level 3: LLM unavailable → static error message
```

### 8.2 Reconnection Strategy

- Health check every 30s while connected
- 3 consecutive failures → transition to DISCONNECTED
- Reconnect uses exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max), matching Section 1.3
- On reconnect: re-subscribe to events, sync missed activity from `task_activity_log`

### 8.3 SSE Resilience

- Browser `EventSource` auto-reconnects on disconnect
- Server sends heartbeat every 30s to detect dead connections
- Fallback to 10s polling (`useFleetActivitySync`) if SSE unavailable

---

## 9. Files to Create/Modify

### New Files

| File | Purpose |
|---|---|
| `src/lib/gateway/bridge.ts` | GatewayBridge singleton (WS client, event emitter, session tracker) |
| `src/lib/gateway/bridge-events.ts` | AgentEvent types and translation from gateway events |
| `src/app/api/events/stream/route.ts` | SSE endpoint for real-time browser updates |
| `src/lib/town/use-fleet-sse.ts` | React hook replacing polling with SSE subscription |
| `src/lib/chat/commands.ts` | Slash command parser and handlers |

### Modified Files

| File | Changes |
|---|---|
| `src/app/api/chat/route.ts` | Replace CLI shell-out with bridge.sendAgent, return SSE stream |
| `src/app/api/agents/dispatch/route.ts` | Use bridge for gateway dispatch instead of broken REST call |
| `src/lib/gateway/server-client.ts` | Replace HTTP client with bridge reference |
| `src/lib/town/fleet-store.ts` | Dynamic specialist instances, template-based agent list |
| `src/lib/town/use-fleet.ts` | Add SSE hook, keep polling as fallback |
| `src/components/views/NerveCenterView.tsx` | Type-based room rendering, live stats bar, approval badges |
| `src/components/ChatPanel.tsx` | Streaming via EventSource, slash commands, approval prompts |
| `extensions/openclaw-octavius/index.ts` | Add 5 new tools (chat_reply, agent_status, cost_summary, task_dispatch, approval_check). Update `octavius_agents_delegate` tool's `agentId` enum from legacy names (`agent-lifeforce`) to canonical IDs (`gen-lifeforce`, etc.) |

### Deprecated (to remove after migration)

| File | Reason |
|---|---|
| `src/lib/gateway/dispatcher.ts` | Assumed REST `/api/sessions/spawn`; replaced by bridge.ts |
| `src/lib/gateway/orchestrator-router.ts` | Routing now handled by OpenClaw orchestrator agent |
| `src/lib/gateway/server-client.ts` | HTTP singleton; replaced by bridge.ts |

### Unchanged

- `src/lib/memory/` — consolidation, evolution, decay pipelines untouched
- `src/lib/lcm/` — LCM bridge client untouched
- `src/lib/obsidian/` — Obsidian sync untouched
- OpenClaw gateway — no changes needed, we use existing WS protocol

---

## 10. Testing Strategy

| Test | Scope |
|---|---|
| GatewayBridge unit tests | Connection lifecycle, reconnect, event translation |
| Chat streaming integration test | Message → SSE stream → tokens rendered |
| Slash command tests | Each command parsed and handled correctly |
| Fleet store dynamic instances | Spawn/remove specialist instances |
| SSE endpoint test | Events pushed to browser, heartbeat works |
| Degradation test | WS disconnect → fallback → reconnect |
| Approval flow E2E | Task dispatched → approval needed → user approves → agent resumes |

---

## 11. Migration Plan

### 11.1 Feature Flag Rollout

1. **Phase 1:** `ENABLE_WS_BRIDGE=false` (default). All existing code paths unchanged. Build and test bridge.ts in isolation.
2. **Phase 2:** `ENABLE_WS_BRIDGE=true`. Chat route uses bridge when WS connected, falls back to CLI shell-out on failure. SSE endpoint live but polling still active as fallback.
3. **Phase 3:** Remove CLI shell-out path, remove deprecated files (dispatcher.ts, orchestrator-router.ts, server-client.ts). Feature flag removed.

### 11.2 Data Migration

No database schema changes. Existing `task_activity_log`, `agent_model_config`, and `llm_cost_logs` tables are reused as-is. The `agent_id` values in activity logs will shift from legacy names (e.g., `agent-industry`) to canonical IDs (e.g., `gen-industry`) — old records remain unchanged, new records use canonical IDs.

### 11.3 Backwards Compatibility

- FleetStore client-side API (`getAgents()`, `updateAgent()`) preserved during Phase 2 but reads from SSE state instead of sessionStorage
- `/api/dashboard/tasks/activity` endpoint unchanged (polling fallback)
- OpenClaw plugin tools unchanged — 5 new tools are additive

---

## 12. Non-Goals (Explicit Exclusions)

- No changes to OpenClaw gateway code
- No changes to memory consolidation/evolution/decay pipelines
- No changes to Obsidian sync
- No new database tables (reuse existing `task_activity_log`, `agent_model_config`, `llm_cost_logs`)
- No custom context engine plugin (rely on OpenClaw's built-in compaction + LCM)
