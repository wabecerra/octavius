# OpenClaw Gateway Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CLI shell-out with native WebSocket RPC integration between Octavius and OpenClaw gateway, enabling streaming chat, real-time Nerve Center updates, and orchestrator cascade.

**Architecture:** Server-side GatewayBridge singleton maintains persistent WS connection to OpenClaw (port 18789). Chat messages stream via SSE to the browser. Nerve Center receives live agent events via a separate SSE endpoint. Fleet state is server-authoritative.

**Tech Stack:** Next.js 14 App Router, `ws` (npm, already installed), SSE (ReadableStream), better-sqlite3, EventEmitter, OpenClaw protocol v3.

**Spec:** `docs/superpowers/specs/2026-04-01-openclaw-gateway-bridge-design.md`

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `src/lib/gateway/bridge-events.ts` | AgentEvent types, FleetAgentState, GatewayFrame→AgentEvent translator |
| `src/lib/gateway/bridge.ts` | GatewayBridge singleton: WS connection, RPC, event emitter, session/fleet state |
| `src/lib/chat/commands.ts` | Slash command parser + handler functions |
| `src/app/api/events/stream/route.ts` | SSE endpoint pushing AgentEvents to browser |
| `src/app/api/chat/agent-reply/route.ts` | Endpoint for agents to post messages back to ChatPanel |
| `src/app/api/agents/fleet-status/route.ts` | Endpoint returning live fleet state from bridge |
| `src/app/api/llm-costs/summary/route.ts` | Endpoint returning cost summary by period |
| `src/lib/town/use-fleet-sse.ts` | React hook consuming SSE for fleet state |

### Modified Files

| File | Summary of Changes |
|---|---|
| `src/app/api/chat/route.ts` | Replace CLI exec with bridge.sendAgent, return SSE stream, feature flag gate |
| `src/app/api/agents/dispatch/route.ts` | Use bridge for gateway path instead of broken REST |
| `src/lib/town/fleet-store.ts` | Template-based agents, server-authoritative state, remove sessionStorage |
| `src/lib/town/use-fleet.ts` | Wire SSE hook, keep polling as fallback |
| `src/components/ChatPanel.tsx` | EventSource streaming, slash command input, approval prompts |
| `src/components/views/NerveCenterView.tsx` | Type-based room rendering, live stats bar |
| `extensions/openclaw-octavius/index.ts` | 5 new tools + legacy agent ID fix |

---

## Task 1: Bridge Event Types

**Files:**
- Create: `src/lib/gateway/bridge-events.ts`
- Test: `src/lib/gateway/__tests__/bridge-events.test.ts`

- [ ] **Step 1: Write failing test for translateGatewayEvent**

```typescript
// src/lib/gateway/__tests__/bridge-events.test.ts
import { describe, it, expect } from 'vitest'
import { translateGatewayEvent, AgentEventType } from '../bridge-events'
import type { GatewayFrame } from '@/lib/town/ws-gateway'

describe('translateGatewayEvent', () => {
  it('translates agent start event', () => {
    const frame: GatewayFrame = {
      type: 'event', event: 'agent',
      payload: { phase: 'start', runId: 'r1', agentId: 'gen-industry', sessionKey: 'subagent:gen-industry' },
    }
    const result = translateGatewayEvent(frame)
    expect(result).toEqual({
      type: AgentEventType.STARTED,
      agentId: 'gen-industry',
      runId: 'r1',
      sessionKey: 'subagent:gen-industry',
      timestamp: expect.any(String),
    })
  })

  it('translates chat delta event', () => {
    const frame: GatewayFrame = {
      type: 'event', event: 'chat',
      payload: { state: 'delta', text: 'Hello', runId: 'r1', sessionId: 's1' },
    }
    const result = translateGatewayEvent(frame)
    expect(result).toEqual({
      type: AgentEventType.STREAMING,
      text: 'Hello',
      runId: 'r1',
      sessionKey: 's1',
      timestamp: expect.any(String),
    })
  })

  it('translates agent end event', () => {
    const frame: GatewayFrame = {
      type: 'event', event: 'agent',
      payload: { phase: 'end', runId: 'r1', agentId: 'gen-industry', sessionKey: 'subagent:gen-industry' },
    }
    const result = translateGatewayEvent(frame)
    expect(result?.type).toBe(AgentEventType.COMPLETED)
  })

  it('translates agent error event', () => {
    const frame: GatewayFrame = {
      type: 'event', event: 'agent',
      payload: { phase: 'error', runId: 'r1', agentId: 'gen-industry', sessionKey: 'subagent:gen-industry' },
    }
    const result = translateGatewayEvent(frame)
    expect(result?.type).toBe(AgentEventType.FAILED)
  })

  it('returns null for unknown events', () => {
    const frame: GatewayFrame = { type: 'event', event: 'unknown', payload: {} }
    expect(translateGatewayEvent(frame)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gateway/__tests__/bridge-events.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write bridge-events.ts**

```typescript
// src/lib/gateway/bridge-events.ts
import type { GatewayFrame } from '@/lib/town/ws-gateway'

export enum AgentEventType {
  STARTED = 'agent.started',
  STREAMING = 'agent.streaming',
  TOOL_CALL = 'agent.tool_call',
  TOOL_RESULT = 'agent.tool_result',
  SPAWNED = 'agent.spawned',
  COMPLETED = 'agent.completed',
  FAILED = 'agent.failed',
  APPROVAL_NEEDED = 'agent.approval_needed',
}

export interface AgentEvent {
  type: AgentEventType
  agentId?: string
  runId?: string
  sessionKey?: string
  text?: string
  toolName?: string
  toolResult?: string
  taskId?: string
  timestamp: string
}

export type BridgeStatus = 'UNKNOWN' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'AUTH_FAILED'

/** Map OpenClaw session key → canonical fleet agent ID */
export function sessionKeyToAgentId(sessionKey: string): string {
  // 'agent:main' → 'orchestrator'
  if (sessionKey === 'agent:main') return 'orchestrator'
  // 'subagent:gen-industry' → 'gen-industry'
  // 'subagent:specialist-coder-abc123' → 'specialist-coder:abc123'
  const m = sessionKey.match(/^subagent:(.+)$/)
  if (!m) return sessionKey
  const rest = m[1]
  // Check for specialist with taskId suffix: specialist-coder-taskId
  const specMatch = rest.match(/^(specialist-\w+)-(.+)$/)
  if (specMatch) return `${specMatch[1]}:${specMatch[2]}`
  return rest
}

export interface FleetAgentState {
  id: string
  type: string
  status: 'running' | 'idle' | 'done' | 'failed' | 'empty'
  currentTask?: string
  currentTaskId?: string
  runId?: string
  sessionKey?: string
  spawnedAt?: string
}

export function translateGatewayEvent(frame: GatewayFrame): AgentEvent | null {
  const now = new Date().toISOString()
  const p = (frame.payload ?? {}) as Record<string, unknown>

  if (frame.event === 'agent') {
    const agentId = sessionKeyToAgentId((p.sessionKey as string) ?? '')
    const base = { agentId, runId: p.runId as string, sessionKey: p.sessionKey as string, timestamp: now }
    switch (p.phase) {
      case 'start': return { ...base, type: AgentEventType.STARTED }
      case 'end':   return { ...base, type: AgentEventType.COMPLETED }
      case 'error': return { ...base, type: AgentEventType.FAILED }
    }
  }

  if (frame.event === 'chat') {
    const base = { runId: p.runId as string, sessionKey: p.sessionId as string, timestamp: now }
    switch (p.state) {
      case 'delta':   return { ...base, type: AgentEventType.STREAMING, text: p.text as string }
      case 'final':   return { ...base, type: AgentEventType.COMPLETED }
      case 'error':   return { ...base, type: AgentEventType.FAILED }
      case 'aborted': return { ...base, type: AgentEventType.FAILED }
    }
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gateway/__tests__/bridge-events.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/gateway/bridge-events.ts src/lib/gateway/__tests__/bridge-events.test.ts
git commit -m "feat(gateway): add AgentEvent types and gateway event translator"
```

---

## Task 2: GatewayBridge Singleton

**Files:**
- Create: `src/lib/gateway/bridge.ts`
- Test: `src/lib/gateway/__tests__/bridge.test.ts`
- Reference: `src/lib/town/ws-gateway.ts` (adapt patterns, Node.js WS)

This is the core component. It adapts the frame protocol and handshake logic from `ws-gateway.ts` but uses the `ws` npm package for Node.js instead of browser WebSocket API.

- [ ] **Step 1: Write failing test for connection lifecycle**

```typescript
// src/lib/gateway/__tests__/bridge.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock ws module before importing bridge
vi.mock('ws', () => {
  const EventEmitter = require('events')
  class MockWebSocket extends EventEmitter {
    static OPEN = 1
    readyState = 1
    send = vi.fn()
    close = vi.fn()
    constructor() { super(); setTimeout(() => this.emit('open'), 0) }
  }
  return { default: MockWebSocket, WebSocket: MockWebSocket }
})

import { GatewayBridge, getGatewayBridge } from '../bridge'
import { BridgeStatus } from '../bridge-events'

describe('GatewayBridge', () => {
  let bridge: GatewayBridge

  beforeEach(() => {
    bridge = new GatewayBridge({
      host: 'localhost',
      port: 18789,
      token: 'test-token',
    })
  })

  afterEach(() => {
    bridge.destroy()
  })

  it('starts in UNKNOWN status', () => {
    expect(bridge.status).toBe('UNKNOWN')
  })

  it('transitions to CONNECTING on connect()', () => {
    bridge.connect()
    expect(bridge.status).toBe('CONNECTING')
  })

  it('getGatewayBridge returns singleton', () => {
    const a = getGatewayBridge()
    const b = getGatewayBridge()
    expect(a).toBe(b)
    a.destroy()
  })

  it('exposes fleet state map', () => {
    expect(bridge.getFleetState()).toBeDefined()
    expect(typeof bridge.getFleetState().size === 'number' || Array.isArray(bridge.getFleetState())).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gateway/__tests__/bridge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write bridge.ts — connection + handshake**

```typescript
// src/lib/gateway/bridge.ts
import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import type { GatewayFrame } from '@/lib/town/ws-gateway'
import {
  type AgentEvent, type BridgeStatus, type FleetAgentState,
  AgentEventType, translateGatewayEvent, sessionKeyToAgentId,
} from './bridge-events'

// ── Constants ──
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const HEALTH_INTERVAL_MS = 30_000
const HANDSHAKE_TIMEOUT_MS = 15_000
const REQUEST_TIMEOUT_MS = 30_000
const MAX_HEALTH_FAILURES = 3
const MAX_MESSAGE_QUEUE = 10

interface BridgeConfig {
  host?: string
  port?: number
  token?: string
}

interface PendingRequest {
  resolve: (frame: GatewayFrame) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let counter = 0
function nextId() { return `brg_${++counter}_${Date.now()}` }

export class GatewayBridge extends EventEmitter {
  private ws: WebSocket | null = null
  private _status: BridgeStatus = 'UNKNOWN'
  private pending = new Map<string, PendingRequest>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private healthFailures = 0
  private intentionalClose = false
  private host: string
  private port: number
  private token: string
  private fleetState = new Map<string, FleetAgentState>()
  private messageQueue: Array<{ message: string; resolve: (v: unknown) => void; reject: (e: Error) => void }> = []
  private activeRun: string | null = null

  constructor(config: BridgeConfig = {}) {
    super()
    this.host = config.host ?? process.env.OPENCLAW_HOST ?? 'localhost'
    this.port = config.port ?? Number(process.env.OPENCLAW_PORT ?? 18789)
    this.token = config.token ?? process.env.OPENCLAW_TOKEN ?? 'openclaw-local-dev'
    this.setMaxListeners(100)
  }

  get status(): BridgeStatus { return this._status }

  private setStatus(s: BridgeStatus) {
    const prev = this._status
    this._status = s
    if (prev !== s) this.emit('status', s, prev)
  }

  // ── Connection ──

  connect(): void {
    if (this._status === 'CONNECTING' || this._status === 'CONNECTED') return
    this.intentionalClose = false
    this.reconnectAttempt = 0
    this.connectOnce()
  }

  private connectOnce(): void {
    this.setStatus('CONNECTING')
    const url = `ws://${this.host}:${this.port}`
    try {
      const ws = new WebSocket(url)
      this.ws = ws

      ws.on('open', () => { /* wait for challenge */ })

      ws.on('message', (data: WebSocket.Data) => {
        let frame: GatewayFrame
        try { frame = JSON.parse(data.toString()) } catch { return }
        this.handleFrame(frame)
      })

      ws.on('error', (err: Error) => {
        console.warn('[bridge] WS error:', err.message)
        if (this._status !== 'AUTH_FAILED') this.setStatus('DISCONNECTED')
      })

      ws.on('close', () => {
        const wasConnected = this._status === 'CONNECTED'
        if (this._status !== 'AUTH_FAILED') this.setStatus('DISCONNECTED')
        this.clearPending()
        this.stopHealthCheck()
        if (!this.intentionalClose) this.scheduleReconnect(wasConnected)
      })
    } catch (err) {
      console.error('[bridge] Failed to create WS:', (err as Error).message)
      this.setStatus('DISCONNECTED')
      this.scheduleReconnect(false)
    }
  }

  private handleFrame(frame: GatewayFrame): void {
    // Handshake challenge
    if (frame.type === 'event' && frame.event === 'connect.challenge') {
      this.sendHandshake()
      return
    }

    // Response to pending request
    if (frame.type === 'res' && frame.id) {
      const p = this.pending.get(frame.id)
      if (p) {
        clearTimeout(p.timer)
        this.pending.delete(frame.id)
        if (frame.ok) {
          // hello-ok completes handshake
          if ((frame.payload as Record<string, unknown>)?.type === 'hello-ok') {
            this.setStatus('CONNECTED')
            this.reconnectAttempt = 0
            this.healthFailures = 0
            this.startHealthCheck()
          }
          p.resolve(frame)
        } else {
          if (frame.error?.code === 'auth_failed') this.setStatus('AUTH_FAILED')
          p.reject(new Error(frame.error?.message ?? 'Request failed'))
        }
        return
      }
      // Unsolicited hello-ok (reconnect case)
      if (frame.ok && (frame.payload as Record<string, unknown>)?.type === 'hello-ok') {
        this.setStatus('CONNECTED')
        this.reconnectAttempt = 0
        this.startHealthCheck()
      }
      return
    }

    // Streaming/lifecycle events → translate and emit
    if (frame.type === 'event') {
      const agentEvent = translateGatewayEvent(frame)
      if (agentEvent) {
        this.updateFleetFromEvent(agentEvent)
        this.emit('agent-event', agentEvent)
      }
      // Also emit raw events for consumers that need them
      this.emit(`raw:${frame.event}`, frame.payload)
    }
  }

  private sendHandshake(): void {
    const id = nextId()
    const frame: GatewayFrame = {
      type: 'req', id, method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: {
          id: 'octavius-bridge', displayName: 'Octavius Bridge',
          version: '1.0.0', platform: 'node', mode: 'rpc',
          instanceId: `brg-${Date.now()}`,
        },
        auth: { token: this.token },
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
      },
    }
    const timer = setTimeout(() => {
      this.pending.delete(id)
      this.setStatus('DISCONNECTED')
    }, HANDSHAKE_TIMEOUT_MS)
    this.pending.set(id, {
      resolve: () => {},
      reject: () => { this.setStatus('AUTH_FAILED') },
      timer,
    })
    this.ws?.send(JSON.stringify(frame))
  }

  // ── RPC ──

  async request(method: string, params?: Record<string, unknown>, timeout = REQUEST_TIMEOUT_MS): Promise<GatewayFrame> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Bridge not connected')
    const id = nextId()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout: ${method}`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params } as GatewayFrame))
    })
  }

  /** Send a message to the orchestrator agent. Returns the final response frame. */
  async sendAgent(opts: { message: string; sessionKey?: string; timeout?: number }): Promise<GatewayFrame> {
    const { message, sessionKey = 'agent:main', timeout = 600 } = opts
    return this.request('agent', {
      message,
      sessionKey,
      thinking: 'medium',
      timeout,
      idempotencyKey: randomUUID(),
    }, timeout * 1000)
  }

  /** Call a gateway method (used by slash commands like sessions.reset, chat.abort). */
  async call(method: string, params?: Record<string, unknown>): Promise<GatewayFrame> {
    return this.request(method, params)
  }

  // ── Message Queue ──

  get queueLength(): number { return this.messageQueue.length }
  get isRunning(): boolean { return this.activeRun !== null }

  // ── Fleet State ──

  getFleetState(): Map<string, FleetAgentState> {
    return new Map(this.fleetState)
  }

  getFleetSnapshot(): FleetAgentState[] {
    return Array.from(this.fleetState.values())
  }

  private updateFleetFromEvent(event: AgentEvent): void {
    if (!event.agentId) return
    const id = event.agentId
    const existing = this.fleetState.get(id)

    switch (event.type) {
      case AgentEventType.STARTED: {
        this.fleetState.set(id, {
          id, type: this.agentType(id), status: 'running',
          runId: event.runId, sessionKey: event.sessionKey,
          spawnedAt: event.timestamp,
        })
        break
      }
      case AgentEventType.COMPLETED: {
        if (existing) {
          existing.status = 'done'
          const isSpecialist = id.startsWith('specialist-')
          const delay = isSpecialist ? 10_000 : 4_000
          setTimeout(() => {
            if (isSpecialist) this.fleetState.delete(id)
            else if (this.fleetState.get(id)?.status === 'done') {
              this.fleetState.set(id, { ...this.fleetState.get(id)!, status: 'idle' })
              this.emit('agent-event', { type: AgentEventType.COMPLETED, agentId: id, timestamp: new Date().toISOString() })
            }
          }, delay)
        }
        break
      }
      case AgentEventType.FAILED: {
        if (existing) {
          existing.status = 'failed'
          const isSpecialist = id.startsWith('specialist-')
          const delay = isSpecialist ? 10_000 : 4_000
          setTimeout(() => {
            if (isSpecialist) this.fleetState.delete(id)
            else if (this.fleetState.get(id)?.status === 'failed') {
              this.fleetState.set(id, { ...this.fleetState.get(id)!, status: 'idle' })
            }
          }, delay)
        }
        break
      }
      case AgentEventType.SPAWNED: {
        this.fleetState.set(id, {
          id, type: this.agentType(id), status: 'running',
          runId: event.runId, sessionKey: event.sessionKey,
          taskId: event.taskId, spawnedAt: event.timestamp,
        })
        break
      }
    }
  }

  private agentType(id: string): string {
    if (id === 'orchestrator') return 'orchestrator'
    if (id.startsWith('gen-')) return 'generalist'
    if (id.startsWith('specialist-')) return 'specialist'
    return 'unknown'
  }

  // ── Reconnect ──

  private scheduleReconnect(wasConnected: boolean): void {
    if (this.reconnectTimer || this.intentionalClose) return
    if (wasConnected) this.reconnectAttempt = 0
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    )
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.intentionalClose) return
      this.connectOnce()
    }, delay)
  }

  // ── Health Check ──

  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthTimer = setInterval(() => {
      if (this._status !== 'CONNECTED') return
      this.request('ping', {}, 10_000)
        .then(() => { this.healthFailures = 0 })
        .catch(() => {
          this.healthFailures++
          if (this.healthFailures >= MAX_HEALTH_FAILURES) {
            console.warn('[bridge] Health check failed 3x, disconnecting')
            this.ws?.close()
          }
        })
    }, HEALTH_INTERVAL_MS)
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null }
  }

  // ── Cleanup ──

  private clearPending(): void {
    for (const [id, p] of this.pending) {
      p.reject(new Error('Connection closed'))
      clearTimeout(p.timer)
    }
    this.pending.clear()
  }

  destroy(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.stopHealthCheck()
    this.clearPending()
    if (this.ws) { this.ws.close(); this.ws = null }
    this.setStatus('DISCONNECTED')
    this.removeAllListeners()
    _singleton = null
  }
}

// ── Singleton ──
let _singleton: GatewayBridge | null = null

export function getGatewayBridge(): GatewayBridge {
  if (!_singleton) {
    _singleton = new GatewayBridge()
  }
  return _singleton
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gateway/__tests__/bridge.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/gateway/bridge.ts src/lib/gateway/__tests__/bridge.test.ts
git commit -m "feat(gateway): add GatewayBridge singleton with WS RPC and fleet state"
```

---

## Task 3: Slash Command Parser

**Files:**
- Create: `src/lib/chat/commands.ts`
- Test: `src/lib/chat/__tests__/commands.test.ts`

Pure functions — no external dependencies. Easy to test.

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/chat/__tests__/commands.test.ts
import { describe, it, expect } from 'vitest'
import { parseCommand, isSlashCommand } from '../commands'

describe('isSlashCommand', () => {
  it('detects slash commands', () => {
    expect(isSlashCommand('/reset')).toBe(true)
    expect(isSlashCommand('/stop agent:main')).toBe(true)
    expect(isSlashCommand('hello')).toBe(false)
    expect(isSlashCommand('/ not a command')).toBe(false)
  })
})

describe('parseCommand', () => {
  it('parses /reset', () => {
    const cmd = parseCommand('/reset')
    expect(cmd).toEqual({ name: 'reset', args: [] })
  })

  it('parses /stop with sessionKey', () => {
    const cmd = parseCommand('/stop subagent:gen-industry')
    expect(cmd).toEqual({ name: 'stop', args: ['subagent:gen-industry'] })
  })

  it('parses /mode auto', () => {
    const cmd = parseCommand('/mode auto')
    expect(cmd).toEqual({ name: 'mode', args: ['auto'] })
  })

  it('parses /recall with multi-word query', () => {
    const cmd = parseCommand('/recall last week tasks')
    expect(cmd).toEqual({ name: 'recall', args: ['last', 'week', 'tasks'] })
  })

  it('parses /cost with period', () => {
    const cmd = parseCommand('/cost today')
    expect(cmd).toEqual({ name: 'cost', args: ['today'] })
  })

  it('returns null for non-commands', () => {
    expect(parseCommand('hello world')).toBeNull()
  })

  it('returns null for unknown commands', () => {
    expect(parseCommand('/foobar')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/__tests__/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Write commands.ts**

```typescript
// src/lib/chat/commands.ts
import type { GatewayBridge } from '@/lib/gateway/bridge'
import { getDatabase } from '@/lib/memory/db'

export interface ParsedCommand {
  name: string
  args: string[]
}

const KNOWN_COMMANDS = new Set([
  'reset', 'compact', 'recall', 'status', 'agents',
  'approve', 'reject', 'mode', 'stop', 'cost', 'history',
])

export function isSlashCommand(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return false
  const name = trimmed.slice(1).split(/\s+/)[0]
  return KNOWN_COMMANDS.has(name)
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const parts = trimmed.slice(1).split(/\s+/)
  const name = parts[0]
  if (!KNOWN_COMMANDS.has(name)) return null
  return { name, args: parts.slice(1) }
}

export interface CommandResult {
  response: string
  source: 'command'
}

export async function executeCommand(
  cmd: ParsedCommand,
  bridge: GatewayBridge,
): Promise<CommandResult> {
  switch (cmd.name) {
    case 'reset': {
      await bridge.call('sessions.reset', { sessionKey: 'agent:main' })
      return { response: 'Session reset. Your history is preserved in memory.', source: 'command' }
    }
    case 'compact': {
      const res = await bridge.call('sessions.compact', { sessionKey: 'agent:main' })
      const p = res.payload as Record<string, unknown> | undefined
      return {
        response: `Context compacted. ${p?.before ?? '?'}→${p?.after ?? '?'} tokens.`,
        source: 'command',
      }
    }
    case 'status': {
      const fleet = bridge.getFleetSnapshot()
      const active = fleet.filter(a => a.status === 'running').length
      const idle = fleet.filter(a => a.status === 'idle').length
      return {
        response: `Bridge: ${bridge.status} | Agents: ${active} active, ${idle} idle | Queue: ${bridge.queueLength}`,
        source: 'command',
      }
    }
    case 'agents': {
      const fleet = bridge.getFleetSnapshot()
      const lines = fleet.map(a => `${a.id}: ${a.status}${a.currentTask ? ` (${a.currentTask})` : ''}`)
      return { response: lines.join('\n') || 'No agents tracked.', source: 'command' }
    }
    case 'stop': {
      const sessionKey = cmd.args[0]
      if (sessionKey) {
        await bridge.call('chat.abort', { sessionKey })
        return { response: `Stopped agent session: ${sessionKey}`, source: 'command' }
      }
      // Cascade: stop orchestrator + all active sub-agents
      const fleet = bridge.getFleetSnapshot()
      const active = fleet.filter(a => a.status === 'running' && a.sessionKey)
      const aborts = active.map(a => bridge.call('chat.abort', { sessionKey: a.sessionKey }).catch(() => {}))
      await Promise.allSettled(aborts)
      return { response: `Stopped ${active.length} agent(s). Partial results preserved.`, source: 'command' }
    }
    case 'mode': {
      const mode = cmd.args[0]
      if (!mode || !['auto', 'spec-review', 'always-ask'].includes(mode)) {
        return { response: 'Usage: /mode <auto|spec-review|always-ask>', source: 'command' }
      }
      const db = getDatabase()
      db.prepare(
        `INSERT OR REPLACE INTO octavius_config (key, value, updated_at) VALUES (?, ?, ?)`
      ).run('approval_mode', mode, new Date().toISOString())
      return { response: `Approval mode set to ${mode}.`, source: 'command' }
    }
    case 'approve': {
      const subtaskId = cmd.args[0]
      if (!subtaskId) return { response: 'Usage: /approve <subtask-id>', source: 'command' }
      const db = getDatabase()
      db.prepare('UPDATE subtasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('approved', new Date().toISOString(), subtaskId)
      return { response: `Approved. Agent resuming.`, source: 'command' }
    }
    case 'reject': {
      const subtaskId = cmd.args[0]
      if (!subtaskId) return { response: 'Usage: /reject <subtask-id>', source: 'command' }
      const db = getDatabase()
      db.prepare('UPDATE subtasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('rejected', new Date().toISOString(), subtaskId)
      return { response: `Rejected. Agent notified.`, source: 'command' }
    }
    case 'cost': {
      const period = cmd.args[0] ?? 'today'
      const db = getDatabase()
      const since = period === 'today'
        ? new Date().toISOString().slice(0, 10)
        : new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const row = db.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM llm_cost_logs WHERE timestamp >= ?`
      ).get(since) as { total: number }
      return { response: `LLM cost (${period}): $${row.total.toFixed(4)}`, source: 'command' }
    }
    case 'recall': {
      const query = cmd.args.join(' ')
      if (!query) return { response: 'Usage: /recall <search query>', source: 'command' }
      // Delegate to memory search API
      const res = await fetch(`http://localhost:3000/api/memory/search?q=${encodeURIComponent(query)}&limit=5`)
      if (!res.ok) return { response: 'Memory search failed.', source: 'command' }
      const data = await res.json() as { results?: Array<{ content: string; score: number }> }
      const results = data.results ?? []
      if (results.length === 0) return { response: 'No memories found.', source: 'command' }
      const lines = results.map((r, i) => `${i + 1}. ${r.content.slice(0, 200)}`)
      return { response: `**Recall results:**\n${lines.join('\n')}`, source: 'command' }
    }
    case 'history': {
      const res = await bridge.call('sessions.list')
      const sessions = (res.payload as Record<string, unknown>)?.sessions as Array<Record<string, unknown>> ?? []
      const lines = sessions.slice(0, 10).map((s) =>
        `${s.id}: ${s.tokens ?? '?'} tokens (${s.created_at ?? '?'})`
      )
      return { response: lines.join('\n') || 'No sessions found.', source: 'command' }
    }
    default:
      return { response: `Unknown command: /${cmd.name}`, source: 'command' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/__tests__/commands.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/commands.ts src/lib/chat/__tests__/commands.test.ts
git commit -m "feat(chat): add slash command parser and handlers"
```

---

## Task 4: SSE Events Endpoint

**Files:**
- Create: `src/app/api/events/stream/route.ts`
- Depends on: Task 2 (bridge.ts)

- [ ] **Step 1: Write the SSE endpoint**

```typescript
// src/app/api/events/stream/route.ts
import { getGatewayBridge } from '@/lib/gateway/bridge'
import type { AgentEvent } from '@/lib/gateway/bridge-events'

export const dynamic = 'force-dynamic'

export async function GET() {
  const bridge = getGatewayBridge()

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Push current fleet state as initial snapshot
      const fleet = bridge.getFleetSnapshot()
      send('fleet.snapshot', fleet)

      // Push bridge status
      send('bridge.status', { status: bridge.status })

      // Subscribe to agent events
      function onAgentEvent(event: AgentEvent) {
        send(event.type, event)
      }
      bridge.on('agent-event', onAgentEvent)

      // Subscribe to status changes
      function onStatus(status: string) {
        send('bridge.status', { status })
      }
      bridge.on('status', onStatus)

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'))
        } catch {
          cleanup()
        }
      }, 30_000)

      function cleanup() {
        bridge.removeListener('agent-event', onAgentEvent)
        bridge.removeListener('status', onStatus)
        clearInterval(heartbeat)
      }

      // Detect client disconnect — ReadableStream cancel
      // The controller will error when the client disconnects
      const checkClosed = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(''))
        } catch {
          cleanup()
          clearInterval(checkClosed)
        }
      }, 60_000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit src/app/api/events/stream/route.ts 2>&1 | head -20` (or check IDE)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/events/stream/route.ts
git commit -m "feat(events): add SSE endpoint for real-time agent events"
```

---

## Task 5: Chat Route — SSE Streaming with Feature Flag

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Depends on: Task 2 (bridge), Task 3 (commands)

Read the full current file before editing. The current implementation uses `exec()` to shell out to OpenClaw CLI with fallback to intent classifier.

- [ ] **Step 1: Read current chat route**

Read: `src/app/api/chat/route.ts` (192 lines)
Understand the current fallback chain: CLI → intent classifier → embedded LLM

- [ ] **Step 2: Add bridge import and feature flag check at top**

At the top of the file, add imports for bridge, commands, and the feature flag:

```typescript
import { getGatewayBridge } from '@/lib/gateway/bridge'
import { isSlashCommand, parseCommand, executeCommand } from '@/lib/chat/commands'

const ENABLE_WS_BRIDGE = process.env.ENABLE_WS_BRIDGE !== 'false' // default true
```

- [ ] **Step 3: Add slash command handling at the start of POST**

After parsing the message from the request body, add slash command handling before the existing logic:

```typescript
// ── Slash commands ──
if (isSlashCommand(message)) {
  const cmd = parseCommand(message)
  if (cmd) {
    try {
      const bridge = getGatewayBridge()
      const result = await executeCommand(cmd, bridge)
      return NextResponse.json({
        response: result.response,
        source: 'command',
        meta: { durationMs: Date.now() - startTime },
      })
    } catch (err) {
      return NextResponse.json({
        response: `Command failed: ${(err as Error).message}`,
        source: 'command',
        meta: { durationMs: Date.now() - startTime },
      })
    }
  }
}
```

- [ ] **Step 4: Add SSE streaming path before existing CLI path**

After slash command handling, before the existing `exec()` call, add the bridge streaming path:

```typescript
// ── Primary: WebSocket streaming via GatewayBridge ──
if (ENABLE_WS_BRIDGE) {
  const bridge = getGatewayBridge()
  if (bridge.status === 'CONNECTED') {
    try {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          function send(event: string, data: unknown) {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          }

          // Listen for streaming events for this run
          function onAgentEvent(event: unknown) {
            const e = event as import('@/lib/gateway/bridge-events').AgentEvent
            send(e.type, e)
          }
          bridge.on('agent-event', onAgentEvent)

          try {
            const result = await bridge.sendAgent({ message, sessionKey: 'agent:main' })
            const payload = result.payload as Record<string, unknown>
            send('done', {
              response: payload?.summary ?? (payload?.result as Record<string, unknown>)?.payloads?.[0]?.text ?? '',
              source: 'gateway',
              meta: { durationMs: Date.now() - startTime },
            })

            logGatewayChat({
              model: 'orchestrator',
              durationMs: Date.now() - startTime,
              sessionId: 'octavius-chat',
              agentId: 'orchestrator',
              status: 'success',
            })
          } catch (err) {
            send('error', { error: (err as Error).message })
          } finally {
            bridge.removeListener('agent-event', onAgentEvent)
            controller.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      })
    } catch (err) {
      console.warn('[chat] Bridge streaming failed, falling back to CLI:', (err as Error).message)
      // Fall through to CLI path
    }
  }
}

// ── Fallback: existing CLI shell-out (unchanged) ──
```

The existing CLI code below this point remains unchanged.

- [ ] **Step 5: Run dev server smoke test**

Run: `curl -s -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"/status"}' | head -20`
Expected: JSON response with bridge status (even if gateway disconnected)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): add WS bridge streaming with feature flag and slash commands"
```

---

## Task 6: Dispatch Route — Use Bridge

**Files:**
- Modify: `src/app/api/agents/dispatch/route.ts`
- Depends on: Task 2 (bridge)

- [ ] **Step 1: Read current dispatch route**

Read: `src/app/api/agents/dispatch/route.ts` (137 lines)

- [ ] **Step 2: Replace gateway client with bridge**

Replace the import of `getServerGatewayClient` and the gateway path:

Replace:
```typescript
import { getServerGatewayClient } from '@/lib/gateway/server-client'
```
With:
```typescript
import { getGatewayBridge } from '@/lib/gateway/bridge'
```

Replace the gateway dispatch section (lines ~54-91):
```typescript
// ── Primary path: OpenClaw gateway via Bridge ──
const bridge = getGatewayBridge()

if (bridge.status === 'CONNECTED') {
  try {
    const res = await bridge.sendAgent({
      message,
      sessionKey: `subagent:${resolvedAgentId}`,
      timeout: 300,
    })

    const payload = res.payload as Record<string, unknown>
    console.log(`[dispatch] Bridge agent call complete for task=${taskId}`)

    logGatewayChat({
      model: 'orchestrator',
      durationMs: Date.now() - startTime,
      sessionId: sessionId,
      agentId: resolvedAgentId,
      status: 'success',
    })

    return NextResponse.json({
      taskId,
      agentId: resolvedAgentId,
      output: payload?.summary ?? '',
      sessionId,
      status: 'dispatched',
      source: 'gateway',
    })
  } catch (err) {
    console.warn(`[dispatch] Bridge dispatch failed, falling back:`, (err as Error).message)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/dispatch/route.ts
git commit -m "feat(dispatch): use GatewayBridge instead of broken REST client"
```

---

## Task 7: Fleet Store — Template-Based + Server State

**Files:**
- Modify: `src/lib/town/fleet-store.ts`
- Test: `src/lib/town/__tests__/fleet-store.test.ts` (if exists, update; otherwise create)
- Depends on: Task 1 (bridge-events.ts for types)

- [ ] **Step 1: Read current fleet-store.ts**

Read: `src/lib/town/fleet-store.ts` (319 lines)
Key changes:
- Replace `DEFAULT_AGENTS` array with `AGENT_TEMPLATES` + `PERMANENT_AGENTS` (generalists always present, specialists dynamic)
- Add `applyServerState(agents: FleetAgentState[])` method for SSE updates
- Remove sessionStorage persistence (server is now authoritative)

- [ ] **Step 2: Add AgentTemplate type and permanent agents**

At the top of the file, after existing imports, add:

```typescript
import type { FleetAgentState } from '@/lib/gateway/bridge-events'

interface AgentTemplate {
  type: string
  icon: string
  room: string
  maxInstances: number
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  { type: 'specialist-architect', icon: '📐', room: 'command-center', maxInstances: 4 },
  { type: 'specialist-coder', icon: '💻', room: 'workshop', maxInstances: 4 },
  { type: 'specialist-research', icon: '🔬', room: 'library', maxInstances: 4 },
  { type: 'specialist-marketing', icon: '📣', room: 'outpost', maxInstances: 4 },
  { type: 'specialist-writing', icon: '✍️', room: 'library', maxInstances: 4 },
  { type: 'specialist-video', icon: '🎬', room: 'workshop', maxInstances: 4 },
  { type: 'specialist-image', icon: '🎨', room: 'workshop', maxInstances: 4 },
  { type: 'specialist-n8n', icon: '⚡', room: 'workshop', maxInstances: 4 },
]
```

- [ ] **Step 3: Add `applyServerState` method to FleetStore**

Add a method that merges server-authoritative state from GatewayBridge:

```typescript
applyServerState(serverAgents: FleetAgentState[]): void {
  // Keep permanent agents, update status from server
  for (const sa of serverAgents) {
    const existing = this.agents.find(a => a.id === sa.id)
    if (existing) {
      existing.status = sa.status as SeatStatus
      existing.currentTask = sa.currentTask
      existing.currentTaskId = sa.currentTaskId
    } else if (sa.type === 'specialist') {
      // Dynamic specialist instance — add it
      const template = AGENT_TEMPLATES.find(t => sa.id.startsWith(t.type))
      if (template) {
        this.agents.push({
          id: sa.id,
          role: 'specialist',
          label: sa.id,
          emoji: template.icon,
          status: sa.status as SeatStatus,
          currentTask: sa.currentTask,
          currentTaskId: sa.currentTaskId,
          tasksCompleted: 0,
          lastActivityAt: sa.spawnedAt,
        })
      }
    }
  }
  // Remove specialist instances not in server state
  this.agents = this.agents.filter(a =>
    a.role !== 'specialist' || serverAgents.some(sa => sa.id === a.id)
  )
  this.notify()
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/town/fleet-store.ts
git commit -m "feat(fleet): add template-based agents and server state sync"
```

---

## Task 8: SSE Fleet Hook

**Files:**
- Create: `src/lib/town/use-fleet-sse.ts`
- Modify: `src/lib/town/use-fleet.ts` (add SSE, keep polling fallback)
- Depends on: Task 4 (SSE endpoint), Task 7 (fleet store)

- [ ] **Step 1: Write use-fleet-sse.ts**

```typescript
// src/lib/town/use-fleet-sse.ts
'use client'

import { useEffect, useRef } from 'react'
import { getFleetStore } from './fleet-store'
import type { FleetAgentState } from '@/lib/gateway/bridge-events'

export function useFleetSSE() {
  const esRef = useRef<EventSource | null>(null)
  const store = getFleetStore()

  useEffect(() => {
    const es = new EventSource('/api/events/stream')
    esRef.current = es

    es.addEventListener('fleet.snapshot', (e) => {
      try {
        const agents = JSON.parse(e.data) as FleetAgentState[]
        store.applyServerState(agents)
      } catch { /* ignore parse errors */ }
    })

    // Listen for individual agent events
    const agentEvents = [
      'agent.started', 'agent.streaming', 'agent.completed',
      'agent.failed', 'agent.spawned', 'agent.approval_needed',
    ]
    for (const eventType of agentEvents) {
      es.addEventListener(eventType, (e) => {
        try {
          const event = JSON.parse(e.data)
          // Re-apply as a single-agent server state update
          if (event.agentId) {
            const current = store.getSnapshot().agents
            const updated = current.map(a => {
              if (a.id !== event.agentId) return a
              const statusMap: Record<string, string> = {
                'agent.started': 'running',
                'agent.streaming': 'running',
                'agent.completed': 'done',
                'agent.failed': 'failed',
              }
              return { ...a, status: statusMap[eventType] ?? a.status }
            })
            store.applyServerState(updated.map(a => ({
              id: a.id,
              type: a.role,
              status: a.status as FleetAgentState['status'],
              currentTask: a.currentTask,
              currentTaskId: a.currentTaskId,
            })))
          }
        } catch { /* ignore */ }
      })
    }

    es.onerror = () => {
      // EventSource auto-reconnects; polling fallback handled by useFleetActivitySync
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [store])
}
```

- [ ] **Step 2: Wire SSE hook into use-fleet.ts**

In `src/lib/town/use-fleet.ts`, add the SSE hook call inside `useFleetActivitySync` or export it separately. Add at the bottom of the file:

```typescript
// Re-export SSE hook for convenience
export { useFleetSSE } from './use-fleet-sse'
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/town/use-fleet-sse.ts src/lib/town/use-fleet.ts
git commit -m "feat(fleet): add SSE hook for real-time fleet state updates"
```

---

## Task 9: ChatPanel — Streaming + Slash Commands

**Files:**
- Modify: `src/components/ChatPanel.tsx`
- Depends on: Task 5 (chat route SSE), Task 3 (slash commands)

- [ ] **Step 1: Read current ChatPanel.tsx**

Read: `src/components/ChatPanel.tsx` (203 lines)

- [ ] **Step 2: Update onSendMessage to handle SSE responses**

The parent component that calls `onSendMessage` needs to be updated to use `EventSource` or `fetch` with streaming. In ChatPanel, the main change is visual:

Add at top of file:
```typescript
import { isSlashCommand } from '@/lib/chat/commands'
```

Update the input handler to show command prefix styling:

```typescript
const isCommand = isSlashCommand(inputValue)
```

Add a `className` toggle on the input field when `isCommand` is true (e.g., `font-mono text-cyan-400`).

- [ ] **Step 3: Add streaming message support**

Add a new message type for streaming:

```typescript
// In the message rendering section, check for streaming messages
{msg.isStreaming && (
  <span className="animate-pulse">▊</span>
)}
```

- [ ] **Step 4: Add approval prompt rendering**

After the message bubble rendering, add:

```typescript
{msg.approvalNeeded && (
  <div style={{ padding: '8px 12px', background: 'var(--bg-warning)', borderRadius: 8, marginTop: 4 }}>
    <strong>Approval needed</strong>: {msg.approvalNeeded.question}
    <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
      <button onClick={() => onSendMessage(`/approve ${msg.approvalNeeded.subtaskId}`)}>Approve</button>
      <button onClick={() => onSendMessage(`/reject ${msg.approvalNeeded.subtaskId}`)}>Reject</button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat(chat): add streaming rendering, slash command styling, approval prompts"
```

---

## Task 10: NerveCenterView — Type-Based Rooms + Stats Bar

**Files:**
- Modify: `src/components/views/NerveCenterView.tsx`
- Depends on: Task 7 (fleet store), Task 8 (SSE hook)

- [ ] **Step 1: Read current NerveCenterView.tsx**

Read: `src/components/views/NerveCenterView.tsx` (758 lines)

- [ ] **Step 2: Add SSE hook and stats bar**

Add import at top:
```typescript
import { useFleetSSE } from '@/lib/town/use-fleet-sse'
```

Inside the component, add:
```typescript
useFleetSSE() // Subscribe to real-time events
```

Add the stats bar component above the grid:
```typescript
function StatsBar({ agents }: { agents: FleetAgent[] }) {
  const active = agents.filter(a => a.status === 'running').length
  const idle = agents.filter(a => a.status === 'idle' || a.status === 'empty').length
  const approval = agents.filter(a => a.status === 'approval_needed').length
  return (
    <div style={{ display: 'flex', gap: 16, padding: '8px 16px', fontSize: 13, opacity: 0.8 }}>
      <span style={{ color: 'var(--color-success)' }}>{active} active</span>
      <span>·</span>
      <span style={{ opacity: 0.6 }}>{idle} idle</span>
      {approval > 0 && (
        <>
          <span>·</span>
          <span style={{ color: 'var(--color-warning)' }}>{approval} awaiting approval</span>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update room agent filtering**

Replace hardcoded agent-to-room matching with type-based filtering. Find the room rendering logic and update:

```typescript
// Replace room.agents.includes(agent.id) with:
const roomAgents = allAgents.filter(a =>
  room.agents.includes(a.id) ||
  (a.role === 'specialist' && room.specialistTypes?.includes(a.id.split(':')[0]))
)
```

Add `specialistTypes` to the Room interface:
```typescript
interface Room {
  // ... existing fields
  specialistTypes?: string[]
}
```

And add specialist types to relevant rooms (e.g., workshop gets `specialist-coder`, `specialist-video`, etc.).

- [ ] **Step 4: Commit**

```bash
git add src/components/views/NerveCenterView.tsx
git commit -m "feat(nerve-center): add SSE subscription, stats bar, type-based room rendering"
```

---

## Task 11: Plugin API Endpoints

**Files:**
- Create: `src/app/api/chat/agent-reply/route.ts`
- Create: `src/app/api/agents/fleet-status/route.ts`
- Create: `src/app/api/llm-costs/summary/route.ts`
- Depends on: Task 2 (bridge)

These three endpoints are called by the new OpenClaw plugin tools (Task 12).

- [ ] **Step 1: Write agent-reply endpoint**

```typescript
// src/app/api/chat/agent-reply/route.ts
import { NextResponse } from 'next/server'
import { getGatewayBridge } from '@/lib/gateway/bridge'
import { AgentEventType } from '@/lib/gateway/bridge-events'

/**
 * POST /api/chat/agent-reply — Agent posts a message/question to ChatPanel.
 * Body: { message, taskId?, sessionKey?, waitForReply?, timeout? }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { message, taskId, sessionKey, waitForReply = true, timeout = 300 } = body

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const bridge = getGatewayBridge()

  // Emit as an approval-needed event so ChatPanel shows the prompt
  bridge.emit('agent-event', {
    type: AgentEventType.APPROVAL_NEEDED,
    agentId: sessionKey ? sessionKey.replace(/^subagent:/, '') : 'unknown',
    taskId,
    text: message,
    sessionKey,
    timestamp: new Date().toISOString(),
  })

  if (!waitForReply) {
    return NextResponse.json({ status: 'posted', message: 'Message sent to chat.' })
  }

  // Wait for user reply (simple polling with timeout)
  // In production this would use a proper event/promise mechanism
  return NextResponse.json({
    status: 'posted',
    message: 'Message sent to chat. Reply routing via bridge events.',
  })
}
```

- [ ] **Step 2: Write fleet-status endpoint**

```typescript
// src/app/api/agents/fleet-status/route.ts
import { NextResponse } from 'next/server'
import { getGatewayBridge } from '@/lib/gateway/bridge'

/** GET /api/agents/fleet-status — Live fleet state from bridge */
export async function GET() {
  const bridge = getGatewayBridge()
  const fleet = bridge.getFleetSnapshot()
  const running = fleet.filter(a => a.status === 'running').length
  const idle = fleet.filter(a => a.status === 'idle').length
  const failed = fleet.filter(a => a.status === 'failed').length

  return NextResponse.json({
    bridgeStatus: bridge.status,
    agents: fleet,
    summary: { running, idle, failed, total: fleet.length },
  })
}
```

- [ ] **Step 3: Write cost summary endpoint**

```typescript
// src/app/api/llm-costs/summary/route.ts
import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/** GET /api/llm-costs/summary?period=today|week|month|all */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? 'today'

  const db = getDatabase()
  const sinceMap: Record<string, string> = {
    today: new Date().toISOString().slice(0, 10),
    week: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    month: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    all: '2000-01-01',
  }
  const since = sinceMap[period] ?? sinceMap.today

  const total = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM llm_cost_logs WHERE timestamp >= ?`
  ).get(since) as { total: number }

  const byModel = db.prepare(
    `SELECT model, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as calls
     FROM llm_cost_logs WHERE timestamp >= ? GROUP BY model ORDER BY cost DESC`
  ).all(since) as Array<{ model: string; cost: number; calls: number }>

  const byAgent = db.prepare(
    `SELECT agent_id, COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as calls
     FROM llm_cost_logs WHERE timestamp >= ? GROUP BY agent_id ORDER BY cost DESC`
  ).all(since) as Array<{ agent_id: string; cost: number; calls: number }>

  return NextResponse.json({
    period,
    since,
    total: total.total,
    byModel,
    byAgent,
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/agent-reply/route.ts src/app/api/agents/fleet-status/route.ts src/app/api/llm-costs/summary/route.ts
git commit -m "feat(api): add agent-reply, fleet-status, and cost-summary endpoints"
```

---

## Task 12: OpenClaw Plugin — New Tools + Legacy ID Fix

**Files:**
- Modify: `extensions/openclaw-octavius/index.ts`
- Depends on: Task 11 (API endpoints the new tools call)

- [ ] **Step 1: Read current plugin file (tool registry section)**

Read: `extensions/openclaw-octavius/index.ts` — focus on the TOOL_REGISTRY array and the `octavius_agents_delegate` tool definition

- [ ] **Step 2: Fix legacy agent IDs in octavius_agents_delegate**

Find the `agentId` enum in `octavius_agents_delegate` tool and replace:
- `agent-lifeforce` → `gen-lifeforce`
- `agent-industry` → `gen-industry`
- `agent-fellowship` → `gen-fellowship`
- `agent-essence` → `gen-essence`

- [ ] **Step 3: Add 5 new tools to TOOL_REGISTRY**

Add these tool definitions to the TOOL_REGISTRY array:

```typescript
{
  name: 'octavius_chat_reply',
  category: 'agents',
  description: 'Post a message or question back to the Octavius ChatPanel. Used by agents to ask clarifying questions or report progress.',
  keywords: ['chat', 'reply', 'question', 'message', 'approval', 'clarify'],
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'The message or question to show in chat' },
      taskId: { type: 'string', description: 'Related task ID (optional)' },
      sessionKey: { type: 'string', description: 'Session key of the calling agent' },
      waitForReply: { type: 'boolean', description: 'Wait for user reply (default: true)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 300)' },
    },
    required: ['message'],
  },
  execute: async (api, id, params) => {
    const config = getConfig(api)
    const res = await octFetch(api, '/api/chat/agent-reply', {
      method: 'POST',
      body: JSON.stringify(params),
    })
    if (!res.ok) return txt(`Failed to post chat reply: ${res.status}`)
    const data = await res.json()
    return data.reply ? txt(`User replied: ${data.reply}`) : txt('Message posted to chat.')
  },
},
{
  name: 'octavius_agent_status',
  category: 'agents',
  description: 'Query live fleet agent state — running, idle, and failed counts with per-agent details.',
  keywords: ['agents', 'fleet', 'status', 'running', 'idle', 'active'],
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (api, id, params) => {
    const res = await octFetch(api, '/api/agents/fleet-status')
    if (!res.ok) return txt('Failed to fetch fleet status')
    return json(await res.json())
  },
},
{
  name: 'octavius_cost_summary',
  category: 'system',
  description: 'Query LLM spending for a time period. Returns total cost, per-model breakdown, and per-agent breakdown.',
  keywords: ['cost', 'spending', 'llm', 'budget', 'money', 'tokens'],
  parameters: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: 'Time period' },
    },
  },
  execute: async (api, id, params) => {
    const period = params.period || 'today'
    const res = await octFetch(api, `/api/llm-costs/summary?period=${period}`)
    if (!res.ok) return txt('Failed to fetch cost summary')
    return json(await res.json())
  },
},
{
  name: 'octavius_task_dispatch',
  category: 'dashboard',
  description: 'Create a new task and immediately dispatch an agent to work on it. Combines task creation + agent dispatch in one call.',
  keywords: ['task', 'dispatch', 'create', 'agent', 'spawn', 'assign'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description/instruction' },
      quadrant: { type: 'string', enum: ['lifeforce', 'industry', 'fellowship', 'essence'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      agentId: { type: 'string', description: 'Specific agent to assign (optional, defaults to quadrant generalist)' },
    },
    required: ['title', 'quadrant'],
  },
  execute: async (api, id, params) => {
    // Create task
    const taskRes = await octFetch(api, '/api/dashboard/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        quadrant: params.quadrant,
        priority: params.priority || 'medium',
        status: 'backlog',
      }),
    })
    if (!taskRes.ok) return txt(`Failed to create task: ${taskRes.status}`)
    const task = await taskRes.json()

    // Dispatch
    const dispatchRes = await octFetch(api, '/api/agents/dispatch', {
      method: 'POST',
      body: JSON.stringify({
        taskId: task.id,
        agentId: params.agentId,
        instruction: params.description,
      }),
    })
    if (!dispatchRes.ok) return txt(`Task created (${task.id}) but dispatch failed: ${dispatchRes.status}`)
    const dispatch = await dispatchRes.json()
    return json({ taskId: task.id, ...dispatch })
  },
},
{
  name: 'octavius_approval_check',
  category: 'agents',
  description: 'Check if a subtask needs or has user approval. Returns approval status and any user feedback.',
  keywords: ['approval', 'approve', 'reject', 'gate', 'subtask', 'review'],
  parameters: {
    type: 'object',
    properties: {
      subtaskId: { type: 'string', description: 'Subtask ID to check' },
      taskId: { type: 'string', description: 'Parent task ID (returns all subtask approvals)' },
    },
  },
  execute: async (api, id, params) => {
    const query = params.subtaskId
      ? `?subtaskId=${params.subtaskId}`
      : params.taskId ? `?taskId=${params.taskId}` : ''
    const res = await octFetch(api, `/api/dashboard/subtasks${query}`)
    if (!res.ok) return txt('Failed to check approval status')
    return json(await res.json())
  },
},
```

- [ ] **Step 4: Commit**

```bash
git add extensions/openclaw-octavius/index.ts
git commit -m "feat(plugin): add 5 new tools and fix legacy agent IDs"
```

---

## Task 13: Integration Smoke Test

**Files:**
- No new files — manual verification

This task verifies the full pipeline works end-to-end.

- [ ] **Step 1: Ensure OpenClaw gateway is running**

Run: `curl -s http://localhost:18789/health | head -5`
If not running, start it.

- [ ] **Step 2: Start Octavius dev server**

Run: `npm run dev` (port 3000)

- [ ] **Step 3: Test SSE endpoint**

Run: `curl -N http://localhost:3000/api/events/stream`
Expected: Receive `fleet.snapshot` and `bridge.status` events, then heartbeats.

- [ ] **Step 4: Test slash commands**

Run: `curl -s -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"/status"}'`
Expected: JSON with bridge status, agent counts, queue length.

Run: `curl -s -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"/agents"}'`
Expected: JSON with agent list.

- [ ] **Step 5: Test chat message (streaming)**

Run: `curl -N -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"What tasks are in my backlog?"}'`
Expected: If gateway connected, SSE stream with delta events then `done`. If gateway disconnected, JSON response via CLI fallback.

- [ ] **Step 6: Test dispatch via bridge**

Open Octavius dashboard, create a task, click "Dispatch". Check:
- Nerve Center shows agent as "running"
- Activity feed shows events in real-time
- Agent completes and status returns to "idle"

- [ ] **Step 7: Commit any fixes**

```bash
git add -u
git commit -m "fix: integration test fixes for gateway bridge pipeline"
```

---

## Dependency Graph

```
Task 1 (bridge-events.ts)
  ↓
Task 2 (bridge.ts) ←── Task 1
  ↓
Task 3 (commands.ts) ── independent
  ↓
Task 4 (SSE endpoint) ←── Task 2
Task 5 (chat route) ←── Task 2, Task 3
Task 6 (dispatch route) ←── Task 2
  ↓
Task 7 (fleet store) ←── Task 1
Task 8 (SSE hook) ←── Task 4, Task 7
  ↓
Task 9 (ChatPanel) ←── Task 5, Task 3
Task 10 (NerveCenterView) ←── Task 7, Task 8
Task 11 (plugin API endpoints) ←── Task 2
Task 12 (plugin tools) ←── Task 11
  ↓
Task 13 (smoke test) ←── all above
```

Tasks 1, 3 can run in parallel. Tasks 4, 5, 6 can run in parallel (all depend only on 2). Tasks 7-8, 9-10, and 11-12 have their own chains.

## Notes

- **Context & Memory (Spec Section 3):** The four-layer memory architecture and three-way knowledge flow already exist in the codebase (`src/lib/memory/`, `src/lib/lcm/`, `src/lib/obsidian/`, cron jobs). No new implementation needed — the bridge simply enables agents to use these existing tools via the OpenClaw plugin.
- **Message queue (Spec Section 2.6):** Deferred to a follow-up. The bridge exposes `queueLength`/`isRunning` getters for future implementation. The current plan handles one message at a time.
- **`server-client.ts` migration:** Task 6 replaces the import in `dispatch/route.ts`. Run `grep -rn 'server-client' src/` after Task 6 to find any other importers and update them.
