# Agentic Dispatch Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-shot LLM dispatch with a proper agentic pipeline that routes all agent work through OpenClaw's agentic loop, syncs outputs to memory, and adds deep research capabilities for the research specialist.

**Architecture:** Four independent fixes to the agent execution pipeline: (1) rewire dispatch to use the existing TaskDispatcher class that calls OpenClaw gateway's `sessions_spawn`, (2) replace regex-based specialist spawning with a tool the LLM can call via function calling, (3) add post-completion memory sync so agent outputs are stored in KB for future context, (4) build a deep research loop for `specialist-research` with iterative search-extract-evaluate cycles.

**Tech Stack:** TypeScript, Next.js 14 App Router, better-sqlite3, OpenClaw Gateway (localhost:18789), Vitest

---

## File Structure

### Phase 1: Gateway-First Dispatch
- Modify: `src/app/api/agents/dispatch/route.ts` — Replace CLI exec with GatewayClient.request()
- Create: `src/lib/gateway/server-client.ts` — Server-side GatewayClient singleton for API routes
- Create: `src/app/api/agents/dispatch/route.test.ts` — Integration tests for new dispatch
- Create: `src/lib/agents/output-sync.ts` — Stub for Phase 3 memory sync
- Modify: `src/lib/agent-spawner.ts` — Demote to "degraded fallback" only, add deprecation warning

### Phase 2: Tool-Based Specialist Spawning
- Create: `src/lib/agents/specialist-tools.ts` — Tool definitions for specialist spawning + discovery
- Modify: `src/lib/agent-spawner.ts:140-181` — Replace SPAWN_SPECIALIST regex with tool-call parsing in buildAgentPrompt
- Modify: `src/lib/agent-spawner.ts:319-338` — Remove regex matching, add tool-result-based cascade
- Create: `src/lib/agents/specialist-tools.test.ts` — Unit tests for tool definitions and routing

### Phase 3: Post-Completion Memory Sync
- Create: `src/lib/agents/output-sync.ts` — Sync agent output to KB after completion
- Modify: `src/lib/agent-spawner.ts:296-317` — Call output sync after task update
- Modify: `src/app/api/agents/dispatch/route.ts` — Call output sync in gateway path
- Create: `src/lib/agents/output-sync.test.ts` — Unit tests for memory sync

### Phase 4: Deep Research Loop
- Create: `src/lib/deep-research/types.ts` — Type definitions for research state
- Create: `src/lib/deep-research/planner.ts` — Query generation from question + prior learnings
- Create: `src/lib/deep-research/searcher.ts` — Web search execution (Kimi/Tavily)
- Create: `src/lib/deep-research/extractor.ts` — Learning extraction from search results
- Create: `src/lib/deep-research/evaluator.ts` — Gap analysis and completion check
- Create: `src/lib/deep-research/synthesizer.ts` — Final report generation
- Create: `src/lib/deep-research/index.ts` — Public API: deepResearch() with progress callbacks
- Create: `src/lib/deep-research/store.ts` — Shared in-memory research state (outside app/)
- Create: `src/app/api/research/route.ts` — POST to start research, returns taskId
- Create: `src/app/api/research/[taskId]/stream/route.ts` — SSE stream for real-time progress
- Modify: `src/lib/agents/research-agent.ts` — Integrate deep research loop for complex tasks
- Create: `src/lib/deep-research/planner.test.ts` — Unit tests
- Create: `src/lib/deep-research/searcher.test.ts` — Unit tests
- Create: `src/lib/deep-research/extractor.test.ts` — Unit tests
- Create: `src/lib/deep-research/evaluator.test.ts` — Unit tests
- Create: `src/lib/deep-research/index.test.ts` — Integration tests for full loop

---

## Phase 1: Gateway-First Dispatch

### Task 1: Wire dispatch route to use GatewayClient directly

The existing `dispatch/route.ts` uses `child_process.exec('openclaw.mjs agent ...')` which is fragile and bypasses OpenClaw's agentic loop. The `GatewayClient` in `gateway/client.ts` can call `POST /api/sessions/spawn` on the gateway directly. We bypass `TaskDispatcher.dispatch()` because it requires `AgentTask` objects with `complexityScore`/`tier` that the simple dispatch route doesn't have — instead we call `client.request()` directly for the gateway path, keeping it simple.

**Important codebase notes for implementers:**
- `getGatewayClient()` is exported from `src/lib/gateway/use-gateway.ts` (a `'use client'` module). Server-side API routes cannot import it. We'll create a server-side gateway client singleton.
- `getMemoryService()` lives in `src/app/api/memory/auth.ts`, not `src/lib/memory/service.ts`
- `HeartbeatMonitor` has no factory — instantiated as `new HeartbeatMonitor(db)` from `@/lib/memory/heartbeat`
- `GatewayClient` constructor takes `{ address, port }` config

**Files:**
- Modify: `src/app/api/agents/dispatch/route.ts`
- Create: `src/app/api/agents/dispatch/route.test.ts`
- Create: `src/lib/gateway/server-client.ts` — Server-side GatewayClient singleton

- [ ] **Step 1: Write failing test for gateway-first dispatch**

```typescript
// src/app/api/agents/dispatch/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the server gateway client
vi.mock('@/lib/gateway/server-client', () => ({
  getServerGatewayClient: vi.fn(),
}))
vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({
        id: 'task-1', title: 'Test task', description: 'Test',
        status: 'backlog', priority: 'medium', quadrant: 'industry',
      })),
      run: vi.fn(),
    })),
  })),
}))
vi.mock('@/lib/agent-spawner', () => ({
  spawnAgent: vi.fn(),
}))
vi.mock('@/lib/agents/output-sync', () => ({
  syncAgentOutput: vi.fn(),
}))
vi.mock('@/lib/llm-cost/tracker', () => ({
  logGatewayChat: vi.fn(),
}))

import { POST } from './route'

describe('POST /api/agents/dispatch', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('routes through gateway when connected', async () => {
    const { getServerGatewayClient } = await import('@/lib/gateway/server-client')
    const mockRequest = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-123' }),
    })
    vi.mocked(getServerGatewayClient).mockResolvedValue({
      getStatus: () => 'connected',
      request: mockRequest,
    } as any)

    const req = new Request('http://localhost:3000/api/agents/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.source).toBe('gateway')
    expect(data.sessionId).toBe('sess-123')
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/sessions/spawn',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('falls back to embedded spawner when gateway disconnected', async () => {
    const { getServerGatewayClient } = await import('@/lib/gateway/server-client')
    vi.mocked(getServerGatewayClient).mockResolvedValue(null)

    const { spawnAgent } = await import('@/lib/agent-spawner')
    vi.mocked(spawnAgent).mockResolvedValue({
      taskId: 'task-1', agentId: 'gen-industry', model: 'qwen/qwen3.5',
      provider: 'openrouter', output: 'Fallback output', action: 'completed',
      newStatus: 'done', costUsd: 0.001, kbContextUsed: false,
    })

    const req = new Request('http://localhost:3000/api/agents/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(data.source).toBe('embedded-fallback')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/app/api/agents/dispatch/route.test.ts`
Expected: FAIL — route still uses CLI exec, no `server-client` module exists

- [ ] **Step 3: Create server-side GatewayClient singleton**

The `use-gateway.ts` is a `'use client'` module — can't import from API routes. Create a server-safe singleton:

```typescript
// src/lib/gateway/server-client.ts
/**
 * Server-side GatewayClient singleton for use in API routes.
 *
 * The main GatewayClient singleton lives in use-gateway.ts ('use client'),
 * which cannot be imported from Next.js API routes. This provides a
 * server-safe equivalent that lazy-connects to the gateway.
 */
import { GatewayClient } from './client'

let _client: GatewayClient | null = null
let _connectPromise: Promise<void> | null = null

/**
 * Get the server-side GatewayClient, or null if not connectable.
 * Lazy-initializes on first call and awaits connection.
 */
export async function getServerGatewayClient(): Promise<GatewayClient | null> {
  if (!_client) {
    const address = process.env.OPENCLAW_HOST || 'localhost'
    const port = Number(process.env.OPENCLAW_PORT || 18789)
    _client = new GatewayClient({ address, port })

    // Set token if available
    const token = process.env.OPENCLAW_TOKEN || 'openclaw-local-dev'
    _client.setToken(token)

    // Connect and wait for result
    _connectPromise = _client.connect().catch(() => {
      // Connection failed — client stays in disconnected state
    })
  }

  // Wait for connection attempt to complete (first call waits, subsequent are instant)
  if (_connectPromise) await _connectPromise

  return _client.getStatus() === 'connected' ? _client : null
}
```

- [ ] **Step 4: Rewrite dispatch route to use server GatewayClient with embedded fallback**

Replace the full `POST` handler in `src/app/api/agents/dispatch/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { spawnAgent } from '@/lib/agent-spawner'
import { getServerGatewayClient } from '@/lib/gateway/server-client'
import { syncAgentOutput } from '@/lib/agents/output-sync'
import { logGatewayChat } from '@/lib/llm-cost/tracker'

/**
 * POST /api/agents/dispatch — Dispatch a task to an agent.
 *
 * Primary path: OpenClaw gateway via GatewayClient (full agentic loop).
 * Fallback path: Embedded agent spawner (single-shot LLM call).
 *
 * Body: { taskId: string, agentId?: string, instruction?: string }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { taskId, agentId, instruction } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  const db = getDatabase()
  const startTime = Date.now()

  // Load the task
  const task = db.prepare(
    'SELECT * FROM dashboard_tasks WHERE id = ?',
  ).get(taskId) as Record<string, unknown> | undefined

  if (!task) {
    return NextResponse.json({ error: `Task not found: ${taskId}` }, { status: 404 })
  }

  const quadrant = (task.quadrant as string) || 'industry'
  const resolvedAgentId = agentId || `gen-${quadrant}`
  const taskTitle = (task.title as string) || ''
  const taskDescription = (task.description as string) || taskTitle
  const message = instruction
    || `[${quadrant.toUpperCase()} TASK] ${taskTitle}\n\n${taskDescription}`
  const sessionId = `octavius-task-${taskId}`

  // ── Primary path: OpenClaw gateway ──
  const client = await getServerGatewayClient()

  if (client) {
    try {
      const res = await client.request('/api/sessions/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: resolvedAgentId,
          message,
          context: { task_id: taskId, quadrant, priority: task.priority },
        }),
      })

      if (!res.ok) throw new Error(`Gateway returned ${res.status}`)
      const data = await res.json() as { session_id: string }

      console.log(`[dispatch] Spawned gateway session: ${data.session_id} for task=${taskId}`)

      // Log cost tracking
      logGatewayChat({
        model: 'unknown', // gateway will report actual model
        durationMs: Date.now() - startTime,
        sessionId: data.session_id,
        agentId: resolvedAgentId,
        status: 'success',
      })

      // Gateway sessions run asynchronously — the agent runs in OpenClaw's
      // agentic loop with full tool access. Task updates come via the
      // Octavius plugin tools the agent calls during execution.
      return NextResponse.json({
        taskId,
        agentId: resolvedAgentId,
        sessionId: data.session_id,
        status: 'dispatched',
        source: 'gateway',
      })
    } catch (err) {
      console.warn(`[dispatch] Gateway dispatch failed, falling back:`, (err as Error).message)
    }
  }

  // ── Fallback: Embedded agent spawner (single-shot, no tool use) ──
  console.log(`[dispatch] Using embedded fallback for task=${taskId}`)

  try {
    const result = await spawnAgent({ taskId, agentId: resolvedAgentId, instruction })

    // Sync output to memory (Phase 3 implements fully)
    syncAgentOutput(taskId, result.agentId, result.output, quadrant).catch(() => {})

    logGatewayChat({
      model: result.model,
      provider: result.provider,
      durationMs: Date.now() - startTime,
      sessionId,
      agentId: resolvedAgentId,
      status: 'success',
    })

    return NextResponse.json({
      taskId,
      agentId: result.agentId,
      output: result.output,
      action: result.action,
      newStatus: result.newStatus,
      model: result.model,
      provider: result.provider,
      source: 'embedded-fallback',
    })
  } catch (err) {
    console.error(`[dispatch] Embedded fallback failed:`, (err as Error).message)

    logGatewayChat({
      model: 'unknown',
      durationMs: Date.now() - startTime,
      sessionId,
      agentId: resolvedAgentId,
      status: 'error',
      error: (err as Error).message,
    })

    return NextResponse.json(
      { error: `Agent dispatch failed: ${(err as Error).message}`, taskId },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 5: Create stub for output-sync (Phase 3 implements fully)**

```typescript
// src/lib/agents/output-sync.ts
/**
 * Sync agent output to the memory/KB system.
 * Stub — fully implemented in Phase 3.
 */
export async function syncAgentOutput(
  _taskId: string,
  _agentId: string,
  _output: string,
  _quadrant: string,
): Promise<void> {
  // Phase 3 implements this
}
```

- [ ] **Step 6: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/app/api/agents/dispatch/route.test.ts`
Expected: PASS — both gateway and fallback paths work

- [ ] **Step 7: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/app/api/agents/dispatch/route.ts src/app/api/agents/dispatch/route.test.ts src/lib/gateway/server-client.ts src/lib/agents/output-sync.ts
git commit -m "feat(dispatch): route agent dispatch through GatewayClient

Replace CLI exec('openclaw.mjs agent ...') with GatewayClient.request()
calling OpenClaw gateway's POST /api/sessions/spawn for full agentic
loop execution. Embedded agent-spawner retained as degraded fallback only.
Add server-side gateway client singleton and stub for output-sync (Phase 3)."
```

---

## Phase 2: Tool-Based Specialist Spawning

### Task 2: Define specialist tools for function calling

Replace the `SPAWN_SPECIALIST:\s*(\S+)\nINSTRUCTION:\s*(.+)` regex with proper tool definitions that the LLM can call via its native function-calling capability. Also add a tool discovery mechanism.

**Files:**
- Create: `src/lib/agents/specialist-tools.ts`
- Create: `src/lib/agents/specialist-tools.test.ts`

- [ ] **Step 1: Write failing test for tool definitions**

```typescript
// src/lib/agents/specialist-tools.test.ts
import { describe, it, expect } from 'vitest'
import {
  getSpecialistTools,
  parseToolCalls,
  SPECIALIST_IDS,
} from './specialist-tools'

describe('specialist-tools', () => {
  it('returns tool definitions with valid JSON schema', () => {
    const tools = getSpecialistTools()
    expect(tools).toHaveLength(2) // spawn_specialist + discover_specialists

    const spawnTool = tools.find(t => t.function.name === 'spawn_specialist')
    expect(spawnTool).toBeDefined()
    expect(spawnTool!.function.parameters.required).toContain('specialist_id')
    expect(spawnTool!.function.parameters.required).toContain('instruction')
  })

  it('discover_specialists returns all available specialists', () => {
    const tools = getSpecialistTools()
    const discoverTool = tools.find(t => t.function.name === 'discover_specialists')
    expect(discoverTool).toBeDefined()
  })

  it('parseToolCalls extracts spawn requests from LLM response', () => {
    const llmResponse = {
      tool_calls: [{
        function: {
          name: 'spawn_specialist',
          arguments: JSON.stringify({
            specialist_id: 'specialist-research',
            instruction: 'Research top anxiety apps',
          }),
        },
      }],
    }

    const calls = parseToolCalls(llmResponse.tool_calls)
    expect(calls).toHaveLength(1)
    expect(calls[0].specialistId).toBe('specialist-research')
    expect(calls[0].instruction).toBe('Research top anxiety apps')
  })

  it('validates specialist_id against known IDs', () => {
    expect(SPECIALIST_IDS).toContain('specialist-research')
    expect(SPECIALIST_IDS).toContain('specialist-architect')
    expect(SPECIALIST_IDS).toContain('specialist-coder')
    expect(SPECIALIST_IDS).not.toContain('invalid-agent')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/agents/specialist-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement specialist tool definitions**

```typescript
// src/lib/agents/specialist-tools.ts
/**
 * Tool definitions for specialist spawning via LLM function calling.
 *
 * These tools are included in agent prompts so the LLM can semantically
 * decide when to spawn specialists, rather than relying on regex pattern
 * matching against output text.
 */

export const SPECIALIST_IDS = [
  'specialist-architect',
  'specialist-coder',
  'specialist-research',
  'specialist-marketing',
  'specialist-writing',
  'specialist-video',
  'specialist-image',
  'specialist-n8n',
] as const

export type SpecialistId = typeof SPECIALIST_IDS[number]

const SPECIALIST_DESCRIPTIONS: Record<SpecialistId, string> = {
  'specialist-architect': 'System design, implementation planning, architecture decisions. Produces specs and step-by-step implementation plans.',
  'specialist-coder': 'Code implementation, debugging, testing. Executes implementation plans produced by the architect.',
  'specialist-research': 'Deep research with iterative web search, fact extraction, and comprehensive report synthesis.',
  'specialist-marketing': 'Market analysis, positioning strategy, competitive research, go-to-market planning.',
  'specialist-writing': 'Content creation, copywriting, documentation, blog posts, communication drafts.',
  'specialist-video': 'Video content planning, scripting, storyboarding, production guidance.',
  'specialist-image': 'Image generation prompts, visual design guidance, brand asset creation.',
  'specialist-n8n': 'Workflow automation design and implementation using N8N platform.',
}

export interface SpawnRequest {
  specialistId: SpecialistId
  instruction: string
}

/**
 * Returns OpenAI-compatible tool definitions for specialist spawning.
 * Include these in the `tools` array when calling the LLM.
 */
export function getSpecialistTools(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return [
    {
      type: 'function',
      function: {
        name: 'spawn_specialist',
        description: 'Spawn a specialist agent to handle a sub-task that requires domain expertise. The specialist will work on the task and append its output. Use this when the task needs skills beyond your generalist capabilities.',
        parameters: {
          type: 'object',
          properties: {
            specialist_id: {
              type: 'string',
              enum: [...SPECIALIST_IDS],
              description: `The specialist to spawn. Available:\n${
                SPECIALIST_IDS.map(id => `- ${id}: ${SPECIALIST_DESCRIPTIONS[id]}`).join('\n')
              }`,
            },
            instruction: {
              type: 'string',
              description: 'Detailed instruction for the specialist. Be specific about what you need, what format, and what context they should use.',
            },
          },
          required: ['specialist_id', 'instruction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'discover_specialists',
        description: 'List all available specialist agents with their capabilities. Call this if you are unsure which specialist to use.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional natural language query to filter specialists by relevance.',
            },
          },
        },
      },
    },
  ]
}

/**
 * Parse tool_calls from LLM response to extract spawn requests.
 */
export function parseToolCalls(
  toolCalls: Array<{ function: { name: string; arguments: string } }>,
): SpawnRequest[] {
  const requests: SpawnRequest[] = []

  for (const call of toolCalls) {
    if (call.function.name === 'spawn_specialist') {
      try {
        const args = JSON.parse(call.function.arguments)
        if (
          SPECIALIST_IDS.includes(args.specialist_id) &&
          typeof args.instruction === 'string'
        ) {
          requests.push({
            specialistId: args.specialist_id,
            instruction: args.instruction,
          })
        }
      } catch { /* skip malformed */ }
    }
  }

  return requests
}

/**
 * Handle discover_specialists tool call — returns specialist info as text.
 */
export function handleDiscoverSpecialists(query?: string): string {
  let specialists = SPECIALIST_IDS.map(id => ({
    id,
    description: SPECIALIST_DESCRIPTIONS[id],
  }))

  if (query) {
    const lower = query.toLowerCase()
    specialists = specialists.filter(s =>
      s.id.includes(lower) || s.description.toLowerCase().includes(lower)
    )
  }

  return specialists.map(s => `**${s.id}**: ${s.description}`).join('\n\n')
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/agents/specialist-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/agents/specialist-tools.ts src/lib/agents/specialist-tools.test.ts
git commit -m "feat(agents): add tool-based specialist spawning definitions

Replace regex SPAWN_SPECIALIST pattern with OpenAI-compatible function
calling tool definitions. LLM can now semantically decide when to spawn
specialists via spawn_specialist and discover_specialists tools."
```

### Task 3: Integrate tool-based spawning into agent-spawner

Wire the new tool definitions into the prompt builder and replace regex parsing.

**Files:**
- Modify: `src/lib/agent-spawner.ts`

- [ ] **Step 1: Add tool definitions to buildAgentPrompt**

In `src/lib/agent-spawner.ts`, replace the `Sub-Agent Spawning` section in `buildAgentPrompt` (lines ~170-181). Remove the old text-based instructions and add a description of the function calling tools:

```typescript
// In buildAgentPrompt, replace the Sub-Agent Spawning section with:

  // Tools section — describe the function calling tools available
  sections.push(`## Available Tools

You can interact with the Octavius system via these HTTP APIs:

### Knowledge Base (Memory)
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/search\` — Search KB: {"text": "query", "limit": 10}
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/context\` — Get context: {"query": "...", "quadrant": "industry", "top_n": 5}
- \`POST ${OCTAVIUS_BASE_URL}/api/memory/items\` — Store to KB: {"text": "...", "type": "semantic", "layer": "daily_notes", "tags": [...], "importance": 0.7}

### Task Management
- \`PATCH ${OCTAVIUS_BASE_URL}/api/dashboard/tasks/${task.id}\` — Update this task

### Specialist Agents (via function calling)
You have access to \`spawn_specialist\` and \`discover_specialists\` function tools.
Use them to delegate sub-tasks that need domain expertise. The LLM runtime will
execute these tool calls automatically — do NOT include text-based spawn commands.

### Important
- When you complete your deliverable, include it in your response
- If the task is fully complete, end your response with: TASK_COMPLETE
- Store important findings/decisions in the KB for future reference`)
```

- [ ] **Step 2: Replace regex spawn detection with tool-call parsing**

In `src/lib/agent-spawner.ts`, in the `spawnAgent` function, replace the regex block (lines ~319-338) with:

```typescript
  // Import at top of file:
  // import { getSpecialistTools, parseToolCalls } from './agents/specialist-tools'

  // In spawnAgent(), after updating the task in DB, replace the regex block:

  // Check for tool_calls in LLM response (if provider supports function calling)
  if (result.toolCalls && result.toolCalls.length > 0) {
    const spawnRequests = parseToolCalls(result.toolCalls)
    for (const req of spawnRequests) {
      if (AGENT_WORKSPACE_MAP[req.specialistId]) {
        db.prepare(
          `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(request.taskId, agentId, 'spawn_requested',
          `Requested ${req.specialistId}: ${req.instruction}`, null, 0, now)

        spawnSpecialistCascade(request.taskId, agentId, req.specialistId, req.instruction)
          .catch(err => {
            console.error(`[agent-spawner] Specialist cascade failed for ${req.specialistId}:`, err)
          })
      }
    }
  }

  // Legacy fallback: still check for text-based pattern (for models without tool calling)
  if (!result.toolCalls || result.toolCalls.length === 0) {
    const spawnMatch = agentOutput.match(/SPAWN_SPECIALIST:\s*(\S+)\nINSTRUCTION:\s*(.+)/m)
    if (spawnMatch) {
      const [, specialistId, specialistInstruction] = spawnMatch
      if (AGENT_WORKSPACE_MAP[specialistId]) {
        spawnSpecialistCascade(request.taskId, agentId, specialistId, specialistInstruction)
          .catch(err => console.error(`[agent-spawner] Legacy cascade failed:`, err))
      }
    }
  }
```

- [ ] **Step 3: Pass tool definitions to callLLM**

In `spawnAgent()`, update the `callLLM` call to include tools:

```typescript
  const { getSpecialistTools } = await import('./agents/specialist-tools')

  const result = await callLLM(
    [
      {
        role: 'system',
        content: workspaceFiles['AGENTS.md'] || `You are a ${quadrant} specialist agent in the Octavius Life OS. You produce actionable deliverables.`,
      },
      { role: 'user', content: prompt },
    ],
    {
      model: agentCfg.model,
      provider: agentCfg.provider,
      maxTokens: request.maxTokens || 4096,
      temperature: 0.4,
      label: `spawn-${agentId}`,
      quadrant,
      tools: getSpecialistTools(),
    },
  )
```

Note: This requires `callLLM` to accept and forward a `tools` parameter. Check if `src/lib/llm-caller.ts` and `src/lib/openrouter.ts` already support it. If not, add `tools?: unknown[]` to the opts and forward to the OpenRouter API body. OpenRouter's `/api/v1/chat/completions` accepts standard OpenAI tool format.

- [ ] **Step 4: Add `tools` support to openrouter.ts**

The current `openrouter.ts` does NOT support `tools` in the request body or `tool_calls` in the response. Both `chatCompletion()` and `callAndLog()` need modifications.

In `src/lib/openrouter.ts`:

**4a. Update `OpenRouterOptions` to accept tools:**

```typescript
export interface OpenRouterOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  allowedModels?: string[]
  /** OpenAI-compatible tool definitions for function calling */
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
}
```

**4b. Update `OpenRouterResponse.choices[].message` to include tool_calls:**

```typescript
export interface OpenRouterResponse {
  id: string
  model: string
  choices: {
    message: {
      role: string
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string
  }[]
  usage: OpenRouterUsage
  created: number
}
```

**4c. Forward `tools` in `chatCompletion()` body:**

In the `chatCompletion` function, add after the `allowedModels` block:

```typescript
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools
```

**4d. Return `toolCalls` from `callAndLog()`:**

Update the return type and body of `callAndLog`:

```typescript
export async function callAndLog(
  messages: OpenRouterMessage[],
  opts: OpenRouterOptions & { label?: string; quadrant?: string } = {},
): Promise<{
  text: string
  model: string
  usage: OpenRouterUsage
  costUsd: number
  toolCalls?: Array<{ function: { name: string; arguments: string } }>
}> {
  const start = Date.now()
  const response = await chatCompletion(messages, opts)
  const durationMs = Date.now() - start

  const entry = toCostLogEntry(response, {
    label: opts.label,
    quadrant: opts.quadrant,
  })
  entry.latency_total_ms = durationMs

  logCostEntry(entry).catch((err) =>
    console.error('[openrouter] Failed to log cost:', err),
  )

  const choice = response.choices[0]
  const toolCalls = choice?.message?.tool_calls?.map(tc => ({
    function: tc.function,
  }))

  return {
    text: choice?.message?.content ?? '',
    model: response.model,
    usage: response.usage,
    costUsd: entry.cost_total_usd,
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  }
}
```

- [ ] **Step 5: Update LLMCallResult and callOpenRouter in llm-caller.ts**

In `src/lib/llm-caller.ts`:

**5a. Add `toolCalls` to `LLMCallResult` and `tools` to opts:**

```typescript
export interface LLMCallResult {
  text: string
  model: string
  provider: string
  costUsd: number
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  fallbackUsed?: string
  toolCalls?: Array<{ function: { name: string; arguments: string } }>
}
```

**5b. Add `tools` to the `callLLM` opts parameter:**

```typescript
export async function callLLM(
  messages: OpenRouterMessage[],
  opts: {
    model: string
    provider?: string
    maxTokens?: number
    temperature?: number
    label?: string
    quadrant?: string
    tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  },
): Promise<LLMCallResult> {
```

**5c. Forward `tools` in `callOpenRouter`:**

```typescript
async function callOpenRouter(
  messages: OpenRouterMessage[],
  opts: {
    model: string
    maxTokens?: number
    temperature?: number
    label?: string
    quadrant?: string
    tools?: unknown[]
  },
): Promise<LLMCallResult> {
  const apiKey = getProviderKey('openrouter')
  if (apiKey) {
    process.env.OPENROUTER_API_KEY = apiKey
  }

  const result = await openRouterCallAndLog(messages, {
    model: opts.model,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    label: opts.label,
    quadrant: opts.quadrant,
    tools: opts.tools as OpenRouterOptions['tools'],
  })
  return {
    text: result.text,
    model: result.model,
    provider: 'openrouter',
    costUsd: result.costUsd,
    usage: {
      prompt_tokens: result.usage.prompt_tokens,
      completion_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.total_tokens,
    },
    toolCalls: result.toolCalls,
  }
}
```

Note: Bedrock `callBedrock` does NOT need tool support yet — specialists are only spawned through the OpenRouter/embedded path. Bedrock tool support can be added later if needed.

- [ ] **Step 6: Run full test suite**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/agents/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/agent-spawner.ts src/lib/llm-caller.ts src/lib/openrouter.ts
git commit -m "feat(agents): integrate tool-based specialist spawning

Agent prompts now include spawn_specialist and discover_specialists as
function-calling tools. LLM semantically decides when to delegate.
Regex fallback kept for models without tool-calling support.
Added toolCalls to LLMCallResult for OpenRouter responses."
```

---

## Phase 3: Post-Completion Memory Sync

### Task 4: Implement output-sync to KB

Agent outputs are currently stored only in the task description field. They need to be synced to the memory/KB system so future agents can find them via context retrieval.

**Files:**
- Modify: `src/lib/agents/output-sync.ts` (replace stub from Task 1)
- Create: `src/lib/agents/output-sync.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/agents/output-sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })),
  })),
}))

import { syncAgentOutput } from './output-sync'

describe('syncAgentOutput', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates a memory item with correct provenance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ memory_id: 'mem-1' }), { status: 201 }),
    )

    await syncAgentOutput('task-1', 'gen-industry', '# Research Report\n\nKey findings...', 'industry')

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/memory/items'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('agent_output'),
      }),
    )

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)
    expect(body.type).toBe('semantic')
    expect(body.provenance.source_type).toBe('agent_output')
    expect(body.provenance.agent_id).toBe('gen-industry')
    expect(body.tags).toContain('quadrant:industry')
    expect(body.tags).toContain('task:task-1')

    fetchSpy.mockRestore()
  })

  it('does not throw on failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    await expect(
      syncAgentOutput('task-1', 'gen-industry', 'output', 'industry'),
    ).resolves.not.toThrow()

    fetchSpy.mockRestore()
  })

  it('skips empty or very short output', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await syncAgentOutput('task-1', 'gen-industry', '', 'industry')
    await syncAgentOutput('task-1', 'gen-industry', 'ok', 'industry')

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/agents/output-sync.test.ts`
Expected: FAIL — stub doesn't call fetch

- [ ] **Step 3: Implement output-sync**

Replace the stub in `src/lib/agents/output-sync.ts`:

```typescript
// src/lib/agents/output-sync.ts
/**
 * Sync agent output to the memory/KB system after task completion.
 *
 * Creates a semantic memory item with agent provenance so future agents
 * can discover prior work via context retrieval.
 */

const OCTAVIUS_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
const MIN_OUTPUT_LENGTH = 50

/**
 * Store agent output as a memory item in the KB.
 * Non-throwing — failures are logged but don't block the dispatch response.
 */
export async function syncAgentOutput(
  taskId: string,
  agentId: string,
  output: string,
  quadrant: string,
): Promise<void> {
  if (!output || output.length < MIN_OUTPUT_LENGTH) return

  try {
    // Extract a summary line from the first heading or first 200 chars
    const summaryMatch = output.match(/^#\s+(.+)/m)
    const summary = summaryMatch?.[1]?.slice(0, 200) || output.slice(0, 200)

    const memoryItem = {
      text: output,
      type: 'semantic' as const,
      layer: 'daily_notes' as const,
      tags: [
        `quadrant:${quadrant}`,
        `task:${taskId}`,
        `agent:${agentId}`,
      ],
      importance: 0.7,
      confidence: 0.8,
      provenance: {
        source_type: 'agent_output',
        source_id: taskId,
        agent_id: agentId,
      },
    }

    const res = await fetch(`${OCTAVIUS_BASE_URL}/api/memory/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memoryItem),
    })

    if (!res.ok) {
      console.warn(`[output-sync] KB write failed (${res.status}):`, await res.text().catch(() => ''))
    } else {
      console.log(`[output-sync] Stored agent output for task=${taskId}, agent=${agentId}, summary="${summary.slice(0, 60)}..."`)
    }
  } catch (err) {
    console.warn(`[output-sync] Failed to sync output:`, (err as Error).message)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/agents/output-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Wire output-sync into agent-spawner**

In `src/lib/agent-spawner.ts`, after the task update (line ~311), add:

```typescript
  // Sync output to memory/KB for future context retrieval
  import('./agents/output-sync').then(({ syncAgentOutput }) => {
    syncAgentOutput(request.taskId, agentId, agentOutput, quadrant).catch(() => {})
  })
```

- [ ] **Step 6: Run full test suite**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/agents/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/agents/output-sync.ts src/lib/agents/output-sync.test.ts src/lib/agent-spawner.ts
git commit -m "feat(agents): sync agent output to KB after completion

Agent outputs are now stored as semantic memories with provenance tracking
(source_type: agent_output, agent_id, task_id). Future agents will find
prior work via context retrieval. Minimum 50 chars to skip trivial outputs."
```

---

## Phase 4: Deep Research Loop

### Task 5: Define types and config

**Files:**
- Create: `src/lib/deep-research/types.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// src/lib/deep-research/types.ts
export interface ResearchConfig {
  maxDepth: number            // recursion levels, default 3
  maxBreadth: number          // parallel queries per level, default 4
  tokenBudget: number         // max tokens to spend, default 500_000
  maxSearches: number         // safety limit, default 50
  model: string               // LLM model for planning/extraction
  synthesisModel?: string     // stronger model for final report (defaults to model)
  searchProvider: 'kimi'      // search backend
  searchApiKey?: string
  quadrant?: string           // octavius quadrant for KB context
  taskId?: string             // link to octavius task
}

export interface Learning {
  fact: string
  source: string
  confidence: number          // 0-1
  topic: string
}

export interface ResearchState {
  id: string
  query: string
  status: 'planning' | 'researching' | 'synthesizing' | 'complete' | 'error'
  learnings: Learning[]
  visitedUrls: string[]
  gaps: string[]
  currentDepth: number
  totalSearches: number
  tokenUsage: number
  progress: ResearchProgress[]
  report?: string
  error?: string
  startedAt: number
  completedAt?: number
}

export interface ResearchProgress {
  step: number
  action: 'plan' | 'search' | 'extract' | 'evaluate' | 'synthesize' | 'error'
  detail: string
  timestamp: number
}

export interface SearchResult {
  url: string
  title: string
  content: string
  snippet: string
}

export const DEFAULT_CONFIG: Omit<ResearchConfig, 'model'> = {
  maxDepth: 3,
  maxBreadth: 4,
  tokenBudget: 500_000,
  maxSearches: 50,
  searchProvider: 'kimi',
}
```

- [ ] **Step 2: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/types.ts
git commit -m "feat(deep-research): add type definitions and config defaults"
```

### Task 6: Implement planner module

**Files:**
- Create: `src/lib/deep-research/planner.ts`
- Create: `src/lib/deep-research/planner.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/deep-research/planner.test.ts
import { describe, it, expect, vi } from 'vitest'
import { generateQueries } from './planner'
import type { ResearchConfig, Learning } from './types'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: JSON.stringify({ queries: ['query 1', 'query 2', 'query 3'] }),
    model: 'test', provider: 'test', costUsd: 0, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }),
}))

describe('generateQueries', () => {
  const config: ResearchConfig = { maxDepth: 3, maxBreadth: 4, tokenBudget: 500000, maxSearches: 50, model: 'test', searchProvider: 'kimi' }

  it('generates the requested number of queries', async () => {
    const queries = await generateQueries('What is the anxiety app market?', 3, [], config)
    expect(queries).toHaveLength(3)
    expect(queries[0]).toBe('query 1')
  })

  it('includes prior learnings in context', async () => {
    const { callLLM } = await import('@/lib/llm-caller')
    const priorLearnings: Learning[] = [
      { fact: 'Calm has 100M downloads', source: 'https://calm.com', confidence: 0.9, topic: 'market size' },
    ]

    await generateQueries('anxiety apps', 3, priorLearnings, config)

    const call = vi.mocked(callLLM).mock.calls[0]
    const userMsg = call[0].find(m => m.role === 'user')
    expect(userMsg?.content).toContain('Calm has 100M downloads')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/planner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement planner**

```typescript
// src/lib/deep-research/planner.ts
import { callLLM } from '@/lib/llm-caller'
import type { Learning, ResearchConfig } from './types'

export async function generateQueries(
  question: string,
  count: number,
  priorLearnings: Learning[],
  config: ResearchConfig,
): Promise<string[]> {
  const learningContext = priorLearnings.length > 0
    ? `\n\nPrior research findings (use these to generate more specific, targeted queries):\n${priorLearnings.map(l => `- ${l.fact}`).join('\n')}`
    : ''

  const result = await callLLM(
    [
      {
        role: 'system',
        content: 'You are a research query planner. Generate diverse, specific search queries to thoroughly investigate the given question. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `Generate exactly ${count} search queries to research:\n\n"${question}"${learningContext}\n\nReturn JSON: { "queries": ["query1", "query2", ...] }`,
      },
    ],
    { model: config.model, provider: 'openrouter', maxTokens: 512, temperature: 0.5, label: 'deep-research-planner' },
  )

  try {
    const parsed = JSON.parse(result.text)
    return (parsed.queries || []).slice(0, count)
  } catch {
    // Fallback: split by newlines if JSON parsing fails
    return result.text.split('\n').filter(l => l.trim()).slice(0, count)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/planner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/planner.ts src/lib/deep-research/planner.test.ts
git commit -m "feat(deep-research): add query planner with learning-informed generation"
```

### Task 7: Implement searcher module

**Files:**
- Create: `src/lib/deep-research/searcher.ts`
- Create: `src/lib/deep-research/searcher.test.ts`

- [ ] **Step 1: Write failing test for searcher**

```typescript
// src/lib/deep-research/searcher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeSearches } from './searcher'
import type { ResearchConfig } from './types'

describe('executeSearches', () => {
  const config: ResearchConfig = {
    maxDepth: 3, maxBreadth: 4, tokenBudget: 500_000,
    maxSearches: 50, model: 'test', searchProvider: 'kimi',
  }

  beforeEach(() => { vi.restoreAllMocks() })

  it('returns parsed search results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { url: 'https://example.com/1', title: 'Result 1', snippet: 'Snippet 1' },
          { url: 'https://example.com/2', title: 'Result 2', snippet: 'Snippet 2' },
        ],
      })),
    )

    const results = await executeSearches(['test query'], [], config)
    expect(results).toHaveLength(2)
    expect(results[0].url).toBe('https://example.com/1')
  })

  it('deduplicates URLs already visited', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { url: 'https://already-seen.com', title: 'Old', snippet: '' },
          { url: 'https://new.com', title: 'New', snippet: '' },
        ],
      })),
    )

    const results = await executeSearches(['query'], ['https://already-seen.com'], config)
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://new.com')
  })

  it('handles fetch failures gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const results = await executeSearches(['query'], [], config)
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Implement searcher**

```typescript
// src/lib/deep-research/searcher.ts
import type { SearchResult, ResearchConfig } from './types'

/**
 * Execute search queries and return parsed results.
 * Uses the configured search provider (Kimi API).
 * Skips URLs already visited.
 */
export async function executeSearches(
  queries: string[],
  visitedUrls: string[],
  config: ResearchConfig,
): Promise<SearchResult[]> {
  const visited = new Set(visitedUrls)
  const results: SearchResult[] = []
  const CONCURRENCY = 3

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(q => searchSingle(q, config)),
    )

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled' && settled.value) {
        for (const r of settled.value) {
          if (!visited.has(r.url)) {
            visited.add(r.url)
            results.push(r)
          }
        }
      }
    }
  }

  return results
}

async function searchSingle(
  query: string,
  config: ResearchConfig,
): Promise<SearchResult[]> {
  const searchUrl = `https://api.${config.searchProvider}.ai/v1/search`

  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) return []

  const data = await res.json()
  return (data.results || []).map((r: { url: string; title?: string; snippet?: string; content?: string }) => ({
    url: r.url,
    title: r.title || '',
    content: r.content || r.snippet || '',
    snippet: r.snippet || '',
  }))
}
```

- [ ] **Step 3: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/searcher.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/searcher.ts src/lib/deep-research/searcher.test.ts
git commit -m "feat(deep-research): add search executor with dedup and concurrency"
```

### Task 8: Implement extractor module

**Files:**
- Create: `src/lib/deep-research/extractor.ts`
- Create: `src/lib/deep-research/extractor.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/deep-research/extractor.test.ts
import { describe, it, expect, vi } from 'vitest'
import { extractLearnings } from './extractor'
import type { ResearchConfig, SearchResult } from './types'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      learnings: [
        { fact: 'Calm has 100M downloads', confidence: 0.9, topic: 'market size' },
        { fact: 'Headspace targets corporate wellness', confidence: 0.8, topic: 'positioning' },
      ],
      followUpQuestions: ['What is Woebot clinical validation?'],
    }),
    model: 'test', provider: 'test', costUsd: 0,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }),
}))

describe('extractLearnings', () => {
  const config: ResearchConfig = { maxDepth: 3, maxBreadth: 4, tokenBudget: 500000, maxSearches: 50, model: 'test', searchProvider: 'kimi' }
  const results: SearchResult[] = [
    { url: 'https://calm.com', title: 'Calm App', content: 'Calm has 100M downloads...', snippet: '' },
  ]

  it('extracts learnings and follow-up questions from search results', async () => {
    const extraction = await extractLearnings('anxiety apps', results, [], config)

    expect(extraction.learnings).toHaveLength(2)
    expect(extraction.learnings[0].fact).toContain('Calm')
    expect(extraction.learnings[0].source).toBe('https://calm.com')
    expect(extraction.followUpQuestions).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/extractor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement extractor**

```typescript
// src/lib/deep-research/extractor.ts
import { callLLM } from '@/lib/llm-caller'
import type { Learning, SearchResult, ResearchConfig } from './types'

interface ExtractionResult {
  learnings: Learning[]
  followUpQuestions: string[]
}

export async function extractLearnings(
  originalQuestion: string,
  results: SearchResult[],
  priorLearnings: Learning[],
  config: ResearchConfig,
): Promise<ExtractionResult> {
  if (results.length === 0) return { learnings: [], followUpQuestions: [] }

  const combinedContent = results
    .map(r => `## Source: ${r.url}\n${(r.content || r.snippet).slice(0, 3000)}`)
    .join('\n\n---\n\n')

  const priorContext = priorLearnings.length > 0
    ? `\n\nAlready known (do NOT repeat):\n${priorLearnings.map(l => `- ${l.fact}`).join('\n')}`
    : ''

  const result = await callLLM(
    [
      {
        role: 'system',
        content: `You are a research analyst. Extract key factual learnings from search results.
Focus on: specific facts, numbers, dates, named entities, relationships, mechanisms.
Do NOT repeat already-known information. Generate follow-up questions for gaps.
Return valid JSON only.`,
      },
      {
        role: 'user',
        content: `Research question: "${originalQuestion}"${priorContext}

Search results:
${combinedContent}

Return JSON:
{
  "learnings": [{ "fact": "concise factual statement", "confidence": 0.0-1.0, "topic": "subtopic" }],
  "followUpQuestions": ["question that fills a gap in understanding"]
}`,
      },
    ],
    { model: config.model, provider: 'openrouter', maxTokens: 1024, temperature: 0.3, label: 'deep-research-extractor' },
  )

  try {
    const parsed = JSON.parse(result.text)
    return {
      learnings: (parsed.learnings || []).map((l: { fact: string; confidence: number; topic: string }) => ({
        ...l,
        source: results[0]?.url ?? 'unknown',
      })),
      followUpQuestions: parsed.followUpQuestions || [],
    }
  } catch {
    return { learnings: [], followUpQuestions: [] }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/extractor.ts src/lib/deep-research/extractor.test.ts
git commit -m "feat(deep-research): add learning extractor with dedup and follow-up generation"
```

### Task 9: Implement evaluator and synthesizer

**Files:**
- Create: `src/lib/deep-research/evaluator.ts`
- Create: `src/lib/deep-research/evaluator.test.ts`
- Create: `src/lib/deep-research/synthesizer.ts`

- [ ] **Step 1: Write failing test for evaluator**

```typescript
// src/lib/deep-research/evaluator.test.ts
import { describe, it, expect, vi } from 'vitest'
import { evaluateCompleteness } from './evaluator'
import type { ResearchConfig, Learning } from './types'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: JSON.stringify({ sufficient: true, reason: 'Comprehensive data', newGaps: [] }),
    model: 'test', provider: 'test', costUsd: 0,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }),
}))

describe('evaluateCompleteness', () => {
  const config: ResearchConfig = {
    maxDepth: 3, maxBreadth: 4, tokenBudget: 500_000,
    maxSearches: 50, model: 'test', searchProvider: 'kimi',
  }

  it('returns insufficient when fewer than 5 learnings', async () => {
    const learnings: Learning[] = [
      { fact: 'Fact 1', source: 'url1', confidence: 0.9, topic: 'a' },
    ]
    const result = await evaluateCompleteness('question', learnings, [], 1000, config)
    expect(result.sufficient).toBe(false)
    expect(result.reason).toContain('Not enough')
  })

  it('returns sufficient when token budget nearly exhausted', async () => {
    const learnings: Learning[] = Array.from({ length: 10 }, (_, i) => ({
      fact: `Fact ${i}`, source: `url${i}`, confidence: 0.9, topic: 'a',
    }))
    const result = await evaluateCompleteness('question', learnings, [], 450_000, config)
    expect(result.sufficient).toBe(true)
    expect(result.reason).toContain('budget')
  })

  it('delegates to LLM when enough learnings and budget', async () => {
    const learnings: Learning[] = Array.from({ length: 10 }, (_, i) => ({
      fact: `Fact ${i}`, source: `url${i}`, confidence: 0.9, topic: 'a',
    }))
    const result = await evaluateCompleteness('question', learnings, [], 100_000, config)
    expect(result.sufficient).toBe(true)
  })
})
```

- [ ] **Step 2: Implement evaluator**

```typescript
// src/lib/deep-research/evaluator.ts
import { callLLM } from '@/lib/llm-caller'
import type { Learning, ResearchConfig } from './types'

interface EvalResult {
  sufficient: boolean
  reason: string
  newGaps: string[]
}

export async function evaluateCompleteness(
  question: string,
  learnings: Learning[],
  gaps: string[],
  tokenUsage: number,
  config: ResearchConfig,
): Promise<EvalResult> {
  // Hard budget limit
  if (tokenUsage >= config.tokenBudget * 0.85) {
    return { sufficient: true, reason: 'Token budget nearly exhausted', newGaps: [] }
  }

  // Minimum learnings before evaluation
  if (learnings.length < 5) {
    return { sufficient: false, reason: 'Not enough data yet', newGaps: gaps }
  }

  const result = await callLLM(
    [
      {
        role: 'system',
        content: 'Evaluate research completeness. Return valid JSON only.',
      },
      {
        role: 'user',
        content: `Question: "${question}"

Learnings (${learnings.length}):
${learnings.map(l => `- [${l.confidence}] ${l.fact}`).join('\n')}

Gaps: ${gaps.join(', ') || 'none identified'}

Return JSON: { "sufficient": true/false, "reason": "why", "newGaps": ["gaps"] }`,
      },
    ],
    { model: config.model, provider: 'openrouter', maxTokens: 512, temperature: 0.2, label: 'deep-research-evaluator' },
  )

  try {
    return JSON.parse(result.text)
  } catch {
    return { sufficient: false, reason: 'Parse error in evaluation', newGaps: [] }
  }
}
```

- [ ] **Step 3: Implement synthesizer**

```typescript
// src/lib/deep-research/synthesizer.ts
import { callLLM } from '@/lib/llm-caller'
import type { Learning, ResearchConfig } from './types'

export async function generateReport(
  question: string,
  learnings: Learning[],
  sources: string[],
  config: ResearchConfig,
): Promise<string> {
  // Deduplicate by fact text
  const unique = Array.from(new Map(learnings.map(l => [l.fact, l])).values())

  // Group by topic
  const byTopic = new Map<string, Learning[]>()
  for (const l of unique) {
    const topic = l.topic || 'general'
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic)!.push(l)
  }

  const structured = Array.from(byTopic.entries())
    .map(([topic, items]) =>
      `### ${topic}\n${items.map(l => `- ${l.fact} (confidence: ${l.confidence})`).join('\n')}`,
    ).join('\n\n')

  const uniqueSources = [...new Set(sources)]
  const synthesisModel = config.synthesisModel || config.model

  const result = await callLLM(
    [
      {
        role: 'system',
        content: `You are an expert research report writer. Write a comprehensive, well-structured
markdown report that synthesizes all findings. Include an executive summary, detailed analysis
organized by theme, actionable recommendations, and a sources section. Target 2000-4000 words.`,
      },
      {
        role: 'user',
        content: `Write a comprehensive research report answering: "${question}"

Research findings by topic:
${structured}

Sources:
${uniqueSources.map((u, i) => `[${i + 1}] ${u}`).join('\n')}`,
      },
    ],
    { model: synthesisModel, provider: 'openrouter', maxTokens: 4096, temperature: 0.4, label: 'deep-research-synthesizer' },
  )

  return result.text
}
```

- [ ] **Step 4: Run evaluator tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/evaluator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/evaluator.ts src/lib/deep-research/evaluator.test.ts src/lib/deep-research/synthesizer.ts
git commit -m "feat(deep-research): add evaluator for gap tracking and report synthesizer"
```

### Task 10: Implement the main research loop

**Files:**
- Create: `src/lib/deep-research/index.ts`
- Create: `src/lib/deep-research/index.test.ts`

- [ ] **Step 1: Write failing integration test**

```typescript
// src/lib/deep-research/index.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn()
    // Planner call
    .mockResolvedValueOnce({
      text: JSON.stringify({ queries: ['query 1', 'query 2'] }),
      model: 'test', provider: 'test', costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })
    // Extractor call
    .mockResolvedValueOnce({
      text: JSON.stringify({
        learnings: [
          { fact: 'Finding 1', confidence: 0.9, topic: 'topic-a' },
          { fact: 'Finding 2', confidence: 0.8, topic: 'topic-a' },
          { fact: 'Finding 3', confidence: 0.7, topic: 'topic-b' },
          { fact: 'Finding 4', confidence: 0.9, topic: 'topic-b' },
          { fact: 'Finding 5', confidence: 0.8, topic: 'topic-c' },
        ],
        followUpQuestions: [],
      }),
      model: 'test', provider: 'test', costUsd: 0.001,
      usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
    })
    // Evaluator call — sufficient
    .mockResolvedValueOnce({
      text: JSON.stringify({ sufficient: true, reason: 'Enough data', newGaps: [] }),
      model: 'test', provider: 'test', costUsd: 0,
      usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
    })
    // Synthesizer call
    .mockResolvedValueOnce({
      text: '# Research Report\n\n## Executive Summary\n\nFindings...',
      model: 'test', provider: 'test', costUsd: 0.01,
      usage: { prompt_tokens: 500, completion_tokens: 1000, total_tokens: 1500 },
    }),
}))

// Mock searcher to avoid real HTTP calls
vi.mock('./searcher', () => ({
  executeSearches: vi.fn().mockResolvedValue([
    { url: 'https://example.com/1', title: 'Result 1', content: 'Content 1', snippet: '' },
    { url: 'https://example.com/2', title: 'Result 2', content: 'Content 2', snippet: '' },
  ]),
}))

import { deepResearch } from './index'

describe('deepResearch', () => {
  it('runs the full loop and produces a report', async () => {
    const progressUpdates: string[] = []

    const state = await deepResearch(
      'What is the anxiety app market?',
      { maxDepth: 1, maxBreadth: 2, tokenBudget: 500_000, maxSearches: 10, model: 'test', searchProvider: 'kimi' },
      (s) => progressUpdates.push(s.status),
    )

    expect(state.status).toBe('complete')
    expect(state.report).toContain('Research Report')
    expect(state.learnings.length).toBeGreaterThan(0)
    expect(state.totalSearches).toBeGreaterThan(0)
    expect(progressUpdates).toContain('researching')
    expect(progressUpdates).toContain('complete')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement main research loop**

```typescript
// src/lib/deep-research/index.ts
import { generateQueries } from './planner'
import { executeSearches } from './searcher'
import { extractLearnings } from './extractor'
import { evaluateCompleteness } from './evaluator'
import { generateReport } from './synthesizer'
import type { ResearchConfig, ResearchState, Learning } from './types'

export type { ResearchConfig, ResearchState } from './types'

export async function deepResearch(
  query: string,
  config: ResearchConfig,
  onProgress?: (state: ResearchState) => void,
  /** Optional pre-generated ID (used when pre-registering via store) */
  id?: string,
): Promise<ResearchState> {
  const state: ResearchState = {
    id: id || `dr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query,
    status: 'planning',
    learnings: [],
    visitedUrls: [],
    gaps: [query],
    currentDepth: 0,
    totalSearches: 0,
    tokenUsage: 0,
    progress: [],
    startedAt: Date.now(),
  }

  try {
    // Phase 1: Recursive research
    await researchRecursive(query, config.maxBreadth, config.maxDepth, [], state, config, onProgress)

    // Phase 1.5: Gap evaluation — if we have enough learnings, check completeness
    if (state.learnings.length >= 5) {
      const evaluation = await evaluateCompleteness(
        query, state.learnings, state.gaps, state.tokenUsage, config,
      )
      if (!evaluation.sufficient && state.totalSearches < config.maxSearches) {
        // Do one more targeted round on gaps
        const gapQueries = evaluation.newGaps.length > 0 ? evaluation.newGaps : state.gaps
        await researchRecursive(
          gapQueries[0] || query, 2, 1, state.learnings, state, config, onProgress,
        )
      }
    }

    // Phase 2: Synthesize final report
    state.status = 'synthesizing'
    addProgress(state, 'synthesize', `Synthesizing report from ${state.learnings.length} learnings`)
    onProgress?.(state)

    state.report = await generateReport(query, state.learnings, state.visitedUrls, config)
    state.status = 'complete'
    state.completedAt = Date.now()
    onProgress?.(state)
  } catch (err) {
    state.status = 'error'
    state.error = (err as Error).message
    state.completedAt = Date.now()
    onProgress?.(state)
  }

  return state
}

async function researchRecursive(
  query: string,
  breadth: number,
  depth: number,
  priorLearnings: Learning[],
  state: ResearchState,
  config: ResearchConfig,
  onProgress?: (state: ResearchState) => void,
): Promise<void> {
  // Budget checks
  if (state.tokenUsage >= config.tokenBudget || state.totalSearches >= config.maxSearches) return

  state.status = 'researching'
  state.currentDepth = config.maxDepth - depth

  // Step 1: Generate queries
  const queries = await generateQueries(query, breadth, priorLearnings, config)
  addProgress(state, 'plan', `Generated ${queries.length} queries at depth ${state.currentDepth}`)
  onProgress?.(state)

  // Step 2: Search
  const results = await executeSearches(queries, state.visitedUrls, config)
  state.totalSearches += results.length
  state.visitedUrls.push(...results.map(r => r.url))
  addProgress(state, 'search', `Found ${results.length} results (${state.totalSearches} total)`)
  onProgress?.(state)

  if (results.length === 0) return

  // Step 3: Extract learnings
  const extraction = await extractLearnings(query, results, priorLearnings, config)
  state.learnings.push(...extraction.learnings)
  addProgress(state, 'extract', `Extracted ${extraction.learnings.length} learnings, ${extraction.followUpQuestions.length} follow-ups`)
  onProgress?.(state)

  // Step 4: Recurse deeper
  if (depth > 0 && extraction.followUpQuestions.length > 0) {
    const allLearnings = [...priorLearnings, ...extraction.learnings]
    const nextBreadth = Math.max(1, Math.floor(breadth / 2))
    const branches = extraction.followUpQuestions.slice(0, breadth)

    const CONCURRENCY = 2
    for (let i = 0; i < branches.length; i += CONCURRENCY) {
      const batch = branches.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(subQuery =>
          researchRecursive(subQuery, nextBreadth, depth - 1, allLearnings, state, config, onProgress),
        ),
      )
    }
  }
}

function addProgress(state: ResearchState, action: ResearchState['progress'][0]['action'], detail: string) {
  state.progress.push({
    step: state.progress.length + 1,
    action,
    detail,
    timestamp: Date.now(),
  })
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/index.ts src/lib/deep-research/index.test.ts
git commit -m "feat(deep-research): implement recursive research loop with gap evaluation

Full deep research pipeline: plan queries → search → extract learnings →
evaluate gaps → recurse → synthesize report. Breadth halves at each depth
level. Token budget and search count limits enforced."
```

### Task 11: Add SSE streaming API and wire into research agent

**Important implementation notes:**
- The research state Map must live **outside** `app/` in a shared module (`src/lib/deep-research/store.ts`), because Next.js App Router may load route modules in separate contexts. Cross-route `import` from another route file is unreliable.
- The POST route must generate the research ID **before** starting `deepResearch()` to avoid a race condition.

**Files:**
- Create: `src/lib/deep-research/store.ts` — Shared in-memory research state
- Create: `src/app/api/research/route.ts`
- Create: `src/app/api/research/[taskId]/stream/route.ts`
- Modify: `src/lib/agents/research-agent.ts`

- [ ] **Step 1: Create shared research state store**

```typescript
// src/lib/deep-research/store.ts
/**
 * Shared in-memory store for active research tasks.
 * Lives outside app/ so both the POST route and SSE stream route
 * can import the same singleton Map.
 */
import type { ResearchState } from './types'

export const researchTasks = new Map<string, ResearchState>()

/**
 * Register a research task before starting deepResearch().
 * This ensures the ID is available immediately for the response.
 */
export function registerResearch(id: string, query: string): ResearchState {
  const state: ResearchState = {
    id,
    query,
    status: 'planning',
    learnings: [],
    visitedUrls: [],
    gaps: [query],
    currentDepth: 0,
    totalSearches: 0,
    tokenUsage: 0,
    progress: [],
    startedAt: Date.now(),
  }
  researchTasks.set(id, state)
  return state
}

/**
 * Clean up completed research after a delay.
 */
export function scheduleCleanup(id: string, delayMs = 300_000) {
  setTimeout(() => researchTasks.delete(id), delayMs)
}
```

- [ ] **Step 2: Create research API route**

```typescript
// src/app/api/research/route.ts
import { NextResponse } from 'next/server'
import { deepResearch, type ResearchConfig } from '@/lib/deep-research'
import { registerResearch, researchTasks } from '@/lib/deep-research/store'
import { syncAgentOutput } from '@/lib/agents/output-sync'

export async function POST(request: Request) {
  const body = await request.json()
  const { query, taskId, quadrant, config: userConfig } = body

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const config: ResearchConfig = {
    maxDepth: userConfig?.maxDepth ?? 3,
    maxBreadth: userConfig?.maxBreadth ?? 4,
    tokenBudget: userConfig?.tokenBudget ?? 500_000,
    maxSearches: userConfig?.maxSearches ?? 50,
    model: userConfig?.model ?? 'qwen/qwen3.5-plus-20260216',
    synthesisModel: userConfig?.synthesisModel,
    searchProvider: 'kimi',
    quadrant,
    taskId,
  }

  // Generate ID and register BEFORE starting research (avoids race condition)
  const researchId = `dr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const initialState = registerResearch(researchId, query)

  // Start research in background — pass pre-generated ID so state.id matches
  deepResearch(query, config, (state) => {
    researchTasks.set(researchId, state)
  }, researchId).then(async (state) => {
    // Final state update
    researchTasks.set(researchId, state)
    // Sync report to KB
    if (state.report && taskId) {
      await syncAgentOutput(taskId, 'specialist-research', state.report, quadrant || 'industry')
    }
  }).catch(console.error)

  // Return immediately with the pre-registered ID
  return NextResponse.json({
    researchId: initialState.id,
    status: initialState.status,
  })
}
```

- [ ] **Step 3: Create SSE stream route**

```typescript
// src/app/api/research/[taskId]/stream/route.ts
import { researchTasks, scheduleCleanup } from '@/lib/deep-research/store'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId: researchId } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let lastProgressLength = 0
      let attempts = 0

      const interval = setInterval(() => {
        const state = researchTasks.get(researchId)
        if (!state) {
          attempts++
          if (attempts > 60) { // 30 seconds timeout
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', detail: 'Research task not found' })}\n\n`))
            clearInterval(interval)
            controller.close()
          }
          return
        }

        // Send new progress entries
        if (state.progress.length > lastProgressLength) {
          const newEntries = state.progress.slice(lastProgressLength)
          for (const entry of newEntries) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', ...entry })}\n\n`))
          }
          lastProgressLength = state.progress.length
        }

        // Send completion
        if (state.status === 'complete' || state.status === 'error') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: state.status === 'complete' ? 'complete' : 'error',
            report: state.report,
            error: state.error,
            stats: {
              totalSearches: state.totalSearches,
              totalLearnings: state.learnings.length,
              durationMs: (state.completedAt ?? Date.now()) - state.startedAt,
              visitedUrls: state.visitedUrls.length,
            },
          })}\n\n`))
          clearInterval(interval)
          controller.close()

          // Clean up after 5 minutes
          scheduleCleanup(researchId)
        }
      }, 500)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 4: Integrate deep research into research-agent.ts**

Replace the single Kimi call in `src/lib/agents/research-agent.ts` with the deep research loop for high-complexity tasks:

```typescript
// Add to the top of research-agent.ts:
import { deepResearch } from '@/lib/deep-research'
import { syncAgentOutput } from './output-sync'

// In executeResearchTask, replace the complexityScore >= 5 block:

  if (task.complexityScore >= SEARCH_COMPLEXITY_THRESHOLD) {
    try {
      const state = await deepResearch(task.description, {
        maxDepth: task.complexityScore >= 8 ? 3 : 2,
        maxBreadth: task.complexityScore >= 8 ? 4 : 3,
        tokenBudget: 500_000,
        maxSearches: 50,
        model: config.tier2Model || 'qwen/qwen3.5-plus-20260216',
        searchProvider: (config.researchProvider || 'kimi') as 'kimi',
      })

      if (state.report) {
        sourceUrls = state.visitedUrls
        isVerified = true

        // Sync report to KB
        await syncAgentOutput(
          task.id, 'specialist-research', state.report, 'industry',
        ).catch(() => {})

        return {
          result: state.report,
          sourceUrls,
          isVerified,
          baseResult: { result: state.report, routing: { tier: 2, model: config.tier2Model, endpoint: '', isLocal: false } },
        }
      }
    } catch (err) {
      console.warn('[research-agent] Deep research failed, falling back to single search:', (err as Error).message)
      isVerified = false
    }
  }
```

- [ ] **Step 5: Run full test suite**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/deep-research/ src/lib/agents/research-agent.test.ts`
Expected: PASS (existing research-agent tests may need mock updates)

- [ ] **Step 6: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/deep-research/store.ts src/app/api/research/route.ts src/app/api/research/\[taskId\]/stream/route.ts src/lib/agents/research-agent.ts
git commit -m "feat(deep-research): add SSE streaming API and wire into research agent

POST /api/research starts async deep research with progress callbacks.
GET /api/research/{id}/stream provides SSE updates for real-time UI.
Research agent now uses deep research loop for complex tasks (score >= 5)
with iterative search, learning extraction, gap evaluation, and synthesis."
```

### Task 12: Run full build and verify

- [ ] **Step 1: Run full test suite**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `cd /local/workplace/wabo/ocbot/octavius && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Fix any type or build errors found in Step 1 and 2**

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from agentic pipeline integration"
```
