# Conversational Orchestration Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user talks to Octavius via the chat panel, Octavius classifies intent, creates dashboard tasks for actionable requests, dispatches agents, and streams progress back into the chat — all reflected in the Kanban board and Nerve Center.

**Architecture:** An intent classifier (LLM with function-calling tools) sits inside the chat endpoint. Conversational messages get normal responses. Actionable requests trigger task creation + agent dispatch, with system messages streamed back to the chat as agents work. The existing `agent-spawner.ts` → `task_activity_log` → Nerve Center polling pipeline handles the rest.

**Tech Stack:** Next.js 14 App Router, better-sqlite3, vitest, callLLM with OpenAI function-calling tools, SSE for progress, existing ChatPanel component.

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `src/lib/chat/intent-classifier.ts` | LLM-based intent classification with function-calling tools: `create_task`, `ask_question` |
| **Create:** `src/lib/chat/intent-classifier.test.ts` | Tests for intent classification |
| **Create:** `src/lib/chat/task-bridge.ts` | Creates dashboard task + dispatches agent + returns tracking info |
| **Create:** `src/lib/chat/task-bridge.test.ts` | Tests for task bridge |
| **Modify:** `src/app/api/chat/route.ts` | Wire intent classifier into chat endpoint; return task tracking metadata |
| **Modify:** `src/app/page.tsx:135-170` | Handle task-bearing responses; show system messages for dispatch progress |
| **Create:** `src/app/api/chat/[taskId]/progress/route.ts` | SSE endpoint for streaming agent progress back to chat |
| **Modify:** `src/components/ChatPanel.tsx` | Render task cards inline, show agent progress, link to Kanban |

## Phase Overview

1. **Tasks 1-2**: Intent classifier — determine if chat message is actionable vs conversational
2. **Tasks 3-4**: Task bridge — create task + dispatch agent from classified intent
3. **Tasks 5-6**: Wire into chat endpoint + progress streaming
4. **Task 7**: Full build verification

---

### Task 1: Build intent classifier with function-calling tools

**Files:**
- Create: `src/lib/chat/intent-classifier.ts`
- Create: `src/lib/chat/intent-classifier.test.ts`

The intent classifier calls the LLM with two tools: `create_task` (for actionable requests) and `respond` (for questions/conversation). The LLM picks which tool to call based on the user's message.

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/chat/intent-classifier.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn(),
}))

import { classifyIntent, type IntentResult } from './intent-classifier'
import { callLLM } from '@/lib/llm-caller'

describe('classifyIntent', () => {
  it('returns create_task intent when LLM calls create_task tool', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: '',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      toolCalls: [{
        function: {
          name: 'create_task',
          arguments: JSON.stringify({
            title: 'Research AI impact on mental health',
            description: 'Comprehensive research on how AI affects mental health including therapeutic chatbots, social media risks, diagnostic tools, and ethical concerns.',
            quadrant: 'industry',
            priority: 'medium',
          }),
        },
      }],
    })

    const result = await classifyIntent('Research the impact of AI on mental health')

    expect(result.intent).toBe('create_task')
    expect(result.task).toBeDefined()
    expect(result.task!.title).toBe('Research AI impact on mental health')
    expect(result.task!.quadrant).toBe('industry')
  })

  it('returns respond intent when LLM calls respond tool', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: '',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      toolCalls: [{
        function: {
          name: 'respond',
          arguments: JSON.stringify({
            message: 'I can help you with that! Here are some tips for better sleep...',
          }),
        },
      }],
    })

    const result = await classifyIntent('How can I sleep better?')

    expect(result.intent).toBe('respond')
    expect(result.response).toBe('I can help you with that! Here are some tips for better sleep...')
  })

  it('falls back to respond intent when no tool calls returned', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: 'Here is my response without using tools.',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })

    const result = await classifyIntent('Tell me a joke')

    expect(result.intent).toBe('respond')
    expect(result.response).toBe('Here is my response without using tools.')
  })

  it('includes conversation history in context', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: 'Sure, continuing our conversation.',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
    })

    const history = [
      { role: 'user' as const, content: 'I want to improve my fitness' },
      { role: 'assistant' as const, content: 'Great! What aspects of fitness?' },
    ]

    await classifyIntent('Running and strength training', history)

    const callArgs = vi.mocked(callLLM).mock.calls[0]
    // System + history + current message
    expect(callArgs[0].length).toBe(4) // system + 2 history + 1 user
  })

  it('accepts optional model config', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: 'Response.',
      model: 'custom-model',
      provider: 'custom',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })

    await classifyIntent('hello', undefined, { provider: 'custom', model: 'custom-model' })

    const callOpts = vi.mocked(callLLM).mock.calls[0][1]
    expect(callOpts.model).toBe('custom-model')
    expect(callOpts.provider).toBe('custom')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/intent-classifier.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement intent classifier**

```typescript
// src/lib/chat/intent-classifier.ts
import { callLLM } from '@/lib/llm-caller'

export interface TaskIntent {
  title: string
  description: string
  quadrant: string
  priority: string
}

export interface IntentResult {
  intent: 'create_task' | 'respond'
  task?: TaskIntent
  response?: string
}

const INTENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description: 'Create a new task when the user wants something done — research, build, write, analyze, schedule, track, or any actionable request. Use this when the user is asking you to DO something, not just answer a question.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short task title (under 80 chars). Action-oriented, e.g. "Research AI impact on mental health"',
          },
          description: {
            type: 'string',
            description: 'Detailed description of what needs to be done, including any specifics the user mentioned.',
          },
          quadrant: {
            type: 'string',
            enum: ['industry', 'lifeforce', 'fellowship', 'essence'],
            description: 'Life quadrant: industry (work/career/projects), lifeforce (health/fitness/wellness), fellowship (relationships/social), essence (purpose/creativity/values)',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Task priority based on urgency/importance signals in the message',
          },
        },
        required: ['title', 'description', 'quadrant', 'priority'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'respond',
      description: 'Respond directly to the user when they are asking a question, having a conversation, want advice, or when no actionable task is needed.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Your conversational response to the user. Be concise, helpful, and actionable.',
          },
        },
        required: ['message'],
      },
    },
  },
]

const SYSTEM_PROMPT = `You are Octavius, a Life OS assistant. You help the user manage their life across four quadrants:
- **Lifeforce**: Health, fitness, nutrition, sleep, energy
- **Industry**: Work, career, projects, productivity
- **Fellowship**: Relationships, social connections, community
- **Essence**: Purpose, values, creativity, personal growth

You MUST call exactly one tool for every message:
- Call **create_task** when the user wants something DONE — research, build, write, plan, schedule, analyze, track, investigate, create, set up, or any actionable work. Even vague requests like "look into X" or "help me with Y project" should become tasks.
- Call **respond** for questions, advice, conversation, check-ins, or when no actionable work is needed.

When in doubt between a task and a response, lean toward creating a task — the user can always dismiss it, but a missed task means dropped work.`

/**
 * Classify user intent: is this an actionable task or a conversational message?
 * Uses LLM function calling to make the determination.
 * Reuses getChatModelConfig from chat route (passed in by caller) to avoid duplication.
 */
export async function classifyIntent(
  message: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  modelConfig?: { provider: string; model: string },
): Promise<IntentResult> {
  const config = modelConfig || { provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...(history || []).map(h => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: message },
  ]

  const result = await callLLM(messages, {
    model: config.model,
    provider: config.provider,
    maxTokens: 1024,
    temperature: 0.3,
    label: 'octavius-intent',
    tools: INTENT_TOOLS,
  })

  // Parse tool calls
  if (result.toolCalls && result.toolCalls.length > 0) {
    const toolCall = result.toolCalls[0]
    try {
      const args = JSON.parse(toolCall.function.arguments)

      if (toolCall.function.name === 'create_task') {
        return {
          intent: 'create_task',
          task: {
            title: args.title,
            description: args.description,
            quadrant: args.quadrant || 'industry',
            priority: args.priority || 'medium',
          },
        }
      }

      if (toolCall.function.name === 'respond') {
        return {
          intent: 'respond',
          response: args.message,
        }
      }
    } catch {
      // JSON parse failed — fall through to text response
    }
  }

  // Fallback: treat raw text as a response
  return {
    intent: 'respond',
    response: result.text || 'I\'m not sure how to help with that. Could you rephrase?',
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/intent-classifier.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/chat/intent-classifier.ts src/lib/chat/intent-classifier.test.ts
git commit -m "feat(chat): add LLM-based intent classifier with function-calling tools

Uses create_task and respond tools to determine if a chat message
is an actionable request (→ task creation) or a conversation (→ direct response).
Includes conversation history for context-aware classification."
```

---

### Task 2: Build task bridge (create task + dispatch agent)

**Files:**
- Create: `src/lib/chat/task-bridge.ts`
- Create: `src/lib/chat/task-bridge.test.ts`

The task bridge takes a classified task intent, creates a dashboard task, dispatches it to the appropriate agent, and returns tracking info.

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/chat/task-bridge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
    })),
  })),
}))

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-task-id') }))

vi.mock('@/lib/agent-spawner', () => ({
  spawnAgent: vi.fn(),
}))

vi.mock('@/lib/agents/output-sync', () => ({
  syncAgentOutput: vi.fn(() => Promise.resolve()),
}))

import { bridgeTaskToAgent } from './task-bridge'
import type { TaskIntent } from './intent-classifier'
import { spawnAgent } from '@/lib/agent-spawner'

describe('bridgeTaskToAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a task and dispatches it, returning tracking info', async () => {
    vi.mocked(spawnAgent).mockResolvedValueOnce({
      agentId: 'gen-industry',
      output: 'Research complete',
      action: 'completed',
      newStatus: 'done',
      model: 'test-model',
      provider: 'test',
    })

    const intent: TaskIntent = {
      title: 'Research AI mental health',
      description: 'Deep research on AI impact on mental health',
      quadrant: 'industry',
      priority: 'medium',
    }

    const result = await bridgeTaskToAgent(intent)

    expect(result.success).toBe(true)
    expect(result.taskId).toBe('test-task-id')
    expect(result.agentId).toBe('gen-industry')
    expect(result.dispatched).toBe(true)
    expect(result.message).toContain('Research AI mental health')

    // Verify spawnAgent was called with correct args
    expect(spawnAgent).toHaveBeenCalledWith({
      taskId: 'test-task-id',
      agentId: 'gen-industry',
    })
  })

  it('returns failure when DB insert throws', async () => {
    const { getDatabase } = await import('@/lib/memory/db')
    vi.mocked(getDatabase).mockReturnValueOnce({
      prepare: vi.fn(() => ({ run: vi.fn(() => { throw new Error('DB error') }) })),
    } as never)

    const intent: TaskIntent = {
      title: 'Test',
      description: 'Test',
      quadrant: 'industry',
      priority: 'medium',
    }

    const result = await bridgeTaskToAgent(intent)

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB error')
  })

  it('returns partial success when dispatch fails but task was created', async () => {
    vi.mocked(spawnAgent).mockRejectedValueOnce(new Error('Agent spawn failed'))

    const intent: TaskIntent = {
      title: 'Test task',
      description: 'Some work',
      quadrant: 'industry',
      priority: 'low',
    }

    const result = await bridgeTaskToAgent(intent)

    expect(result.success).toBe(true)
    expect(result.taskId).toBe('test-task-id')
    expect(result.dispatched).toBe(false)
    expect(result.message).toContain('created')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/task-bridge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement task bridge**

```typescript
// src/lib/chat/task-bridge.ts
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'
import { spawnAgent } from '@/lib/agent-spawner'
import { syncAgentOutput } from '@/lib/agents/output-sync'
import type { TaskIntent } from './intent-classifier'

export interface BridgeResult {
  success: boolean
  taskId?: string
  agentId?: string
  dispatched: boolean
  message: string
  error?: string
}

/**
 * Create a dashboard task from a classified intent and dispatch it to the
 * appropriate agent. Uses direct DB/function calls (no self-fetch).
 */
export async function bridgeTaskToAgent(intent: TaskIntent): Promise<BridgeResult> {
  const db = getDatabase()

  // Step 1: Create the dashboard task directly in DB
  const taskId = nanoid()
  const now = new Date().toISOString()
  try {
    db.prepare(
      `INSERT INTO dashboard_tasks (id, title, description, priority, status, quadrant, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'backlog', ?, 0, ?, ?)`
    ).run(taskId, intent.title.trim(), intent.description.trim(), intent.priority, intent.quadrant, now, now)
  } catch (err) {
    return {
      success: false,
      dispatched: false,
      message: 'Failed to create task — internal error',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // Step 2: Dispatch to the appropriate agent via spawnAgent (no HTTP round-trip)
  const agentId = `gen-${intent.quadrant}`
  try {
    const result = await spawnAgent({ taskId, agentId })

    // Sync output to knowledge base (fire-and-forget)
    syncAgentOutput(taskId, result.agentId, result.output, intent.quadrant).catch(() => {})

    return {
      success: true,
      taskId,
      agentId: result.agentId,
      dispatched: true,
      message: `On it! I've created "${intent.title}" and dispatched ${result.agentId} to work on it. You can track progress in the Nerve Center.`,
    }
  } catch {
    return {
      success: true,
      taskId,
      agentId,
      dispatched: false,
      message: `Task "${intent.title}" created but agent dispatch failed. It's in your backlog — you can dispatch it manually from the Kanban board.`,
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/task-bridge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/lib/chat/task-bridge.ts src/lib/chat/task-bridge.test.ts
git commit -m "feat(chat): add task bridge to create dashboard tasks and dispatch agents

Bridges classified task intents to the existing dashboard task + dispatch
pipeline. Creates task via POST /api/dashboard/tasks, dispatches via
POST /api/agents/dispatch, returns tracking info for chat response."
```

---

### Task 3: Wire intent classifier into chat endpoint

**Files:**
- Modify: `src/app/api/chat/route.ts`

Replace the current chat endpoint's embedded LLM fallback path with the intent classifier. When the classifier returns `create_task`, use the task bridge. When it returns `respond`, return the response directly.

**Important:** Keep the OpenClaw CLI path as the primary path (it handles its own orchestration). Only modify the **fallback path** (lines 126-188) which currently does a plain LLM call.

- [ ] **Step 1: Read the current file**

Read: `src/app/api/chat/route.ts`

- [ ] **Step 2: Modify the fallback path**

Replace lines 126-188 (the `// Fallback: call LLM directly` section) with the intent classifier pipeline below. Also **remove** `CHAT_SYSTEM_PROMPT` (lines 30-36) which becomes dead code — the intent classifier has its own system prompt. Keep `getChatModelConfig` — it's now passed to `classifyIntent` to avoid duplication:

```typescript
    // Fallback: use intent classifier → task bridge pipeline
    console.log('[Chat API] Falling back to intent classifier')
    try {
      const { classifyIntent } = await import('@/lib/chat/intent-classifier')
      const { bridgeTaskToAgent } = await import('@/lib/chat/task-bridge')

      // Parse conversation history from request (if provided)
      const history = body.history as Array<{ role: 'user' | 'assistant'; content: string }> | undefined

      // Reuse getChatModelConfig for intent classification (defined in this file)
      const config = getChatModelConfig()
      const intent = await classifyIntent(message, history, config)
      const durationMs = Date.now() - startTime

      if (intent.intent === 'create_task' && intent.task) {
        // Actionable request → create task + dispatch agent
        const bridge = await bridgeTaskToAgent(intent.task)

        logGatewayChat({
          model: 'intent-classifier',
          durationMs,
          sessionId: 'octavius-chat',
          agentId: bridge.agentId || 'octavius-orchestrator',
          status: bridge.success ? 'success' : 'error',
        })

        return NextResponse.json({
          response: bridge.message,
          source: 'orchestrator',
          action: {
            type: 'task_created',
            taskId: bridge.taskId,
            agentId: bridge.agentId,
            dispatched: bridge.dispatched,
            title: intent.task.title,
            quadrant: intent.task.quadrant,
          },
          meta: { durationMs },
        })
      }

      // Conversational response
      logGatewayChat({
        model: 'intent-classifier',
        durationMs,
        sessionId: 'octavius-chat',
        agentId: 'octavius-embedded',
        status: 'success',
      })

      return NextResponse.json({
        response: intent.response || 'I\'m not sure how to help with that.',
        source: 'embedded',
        meta: { durationMs },
      })
    } catch (fallbackErr: unknown) {
      const fbError = fallbackErr as Error
      console.error('[Chat API] Intent classifier failed:', fbError.message)
      const durationMs = Date.now() - startTime

      logGatewayChat({
        model: 'unknown',
        durationMs,
        sessionId: 'octavius-chat',
        agentId: 'octavius-embedded',
        status: 'error',
        error: fbError.message,
      })

      return NextResponse.json({
        response: 'Sorry, I couldn\'t process your message right now. Please try again later.',
        source: 'error',
      }, { status: 500 })
    }
```

- [ ] **Step 3: Run existing tests + integration check**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/app/api/chat/route.ts
git commit -m "feat(chat): wire intent classifier into chat endpoint fallback path

Chat messages now go through intent classification. Actionable requests
create dashboard tasks and dispatch agents. Conversational messages
get direct responses. Response includes action metadata for UI rendering."
```

---

### Task 4: Add progress SSE endpoint for chat-initiated tasks

**Files:**
- Create: `src/app/api/chat/[taskId]/progress/route.ts`

Streams `task_activity_log` entries for a given task as SSE events so the chat panel can show real-time agent progress.

- [ ] **Step 1: Create the SSE progress endpoint**

```typescript
// src/app/api/chat/[taskId]/progress/route.ts
import { getDatabase } from '@/lib/memory/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params
  const encoder = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | null = null

  // Clean up on client disconnect (belt-and-suspenders with cancel())
  request.signal.addEventListener('abort', () => {
    if (intervalId) { clearInterval(intervalId); intervalId = null }
  })

  const stream = new ReadableStream({
    start(controller) {
      let lastSeenId = 0
      let idleCount = 0
      const MAX_IDLE = 120 // 60 seconds (120 * 500ms)

      intervalId = setInterval(() => {
        try {
          const db = getDatabase()
          const rows = db.prepare(
            `SELECT id, agent_id, action, details, model, cost_usd, timestamp
             FROM task_activity_log
             WHERE task_id = ? AND id > ?
             ORDER BY id ASC`
          ).all(taskId, lastSeenId) as Array<{
            id: number; agent_id: string; action: string; details: string;
            model: string | null; cost_usd: number; timestamp: string
          }>

          if (rows.length > 0) {
            idleCount = 0
            for (const row of rows) {
              lastSeenId = row.id
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'activity',
                agentId: row.agent_id,
                action: row.action,
                details: row.details,
                model: row.model,
                costUsd: row.cost_usd,
                timestamp: row.timestamp,
              })}\n\n`))

              // If agent completed, send final event and close
              if (row.action === 'completed') {
                // Fetch the task to get final output
                const task = db.prepare(
                  'SELECT status, description FROM dashboard_tasks WHERE id = ?'
                ).get(taskId) as { status: string; description: string } | undefined

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'complete',
                  taskStatus: task?.status || 'done',
                })}\n\n`))

                if (intervalId) clearInterval(intervalId)
                controller.close()
                return
              }
            }
          } else {
            idleCount++
            if (idleCount >= MAX_IDLE) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'timeout',
                detail: 'No activity for 60 seconds',
              })}\n\n`))
              if (intervalId) clearInterval(intervalId)
              controller.close()
            }
          }
        } catch {
          // DB error — keep trying
        }
      }, 500)
    },
    cancel() {
      if (intervalId) clearInterval(intervalId)
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

- [ ] **Step 2: Verify build compiles**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/`
Expected: PASS (existing tests unaffected)

- [ ] **Step 3: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add "src/app/api/chat/[taskId]/progress/route.ts"
git commit -m "feat(chat): add SSE progress endpoint for chat-initiated tasks

GET /api/chat/{taskId}/progress streams task_activity_log entries as SSE
events so the chat panel can show real-time agent progress. Closes on
task completion or 60-second idle timeout."
```

---

### Task 5: Update page.tsx to handle action metadata from chat

**Files:**
- Modify: `src/app/page.tsx:135-170`

When the chat response includes `action.type === 'task_created'`, show a system message with task info and optionally start listening for progress via SSE.

- [ ] **Step 1: Read the current handleSendMessage callback**

Read: `src/app/page.tsx` lines 135-170

- [ ] **Step 2: Update handleSendMessage to handle action metadata**

Add a `useRef` for the EventSource and a cleanup effect, then replace the `handleSendMessage` callback (lines 135-170) with:

```typescript
  // Track active SSE connection for cleanup on unmount
  const progressSourceRef = useRef<EventSource | null>(null)
  let msgCounter = 0
  const nextMsgId = (suffix: string) => `msg-${Date.now()}-${++msgCounter}-${suffix}`

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      progressSourceRef.current?.close()
    }
  }, [])

  /** Listen for agent progress via SSE and inject system messages into chat */
  const listenForProgress = useCallback((taskId: string) => {
    // Close any existing connection
    progressSourceRef.current?.close()

    const eventSource = new EventSource(`/api/chat/${taskId}/progress`)
    progressSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'activity') {
          // Show meaningful progress (started, progressed, spawn_requested, completed)
          if (['started', 'progressed', 'spawn_requested', 'completed'].includes(data.action)) {
            const emoji = data.action === 'completed' ? '✅' : data.action === 'spawn_requested' ? '🔄' : '⚡'
            addChatMessage({
              id: nextMsgId('progress'),
              role: 'system',
              content: `${emoji} **${data.agentId}** — ${data.action}: ${data.details?.slice(0, 200) || ''}`,
              timestamp: data.timestamp,
            })
          }
        }

        if (data.type === 'complete') {
          addChatMessage({
            id: nextMsgId('done'),
            role: 'system',
            content: '✅ Task completed! Check the Kanban board for results.',
            timestamp: new Date().toISOString(),
          })
          eventSource.close()
          progressSourceRef.current = null
        }

        if (data.type === 'timeout') {
          eventSource.close()
          progressSourceRef.current = null
        }
      } catch {
        // Ignore parse errors
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      progressSourceRef.current = null
    }
  }, [])

  const handleSendMessage = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: nextMsgId('user'),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(userMsg)
    setChatLoading(true)

    // Build conversation history (last 10 messages for context)
    const history = chatMessages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })).filter(m => m.role === 'user' || m.role === 'assistant')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, history }),
      })
      const data = await res.json()

      // Add the main response
      addChatMessage({
        id: nextMsgId('resp'),
        role: 'assistant',
        content: data.response || data.error || 'No response',
        agentId: data.action?.agentId || (data.source === 'gateway' ? 'octavius-orchestrator' : undefined),
        timestamp: new Date().toISOString(),
      })

      // If a task was created, start listening for agent progress
      if (data.action?.type === 'task_created' && data.action.taskId && data.action.dispatched) {
        listenForProgress(data.action.taskId)
      }
    } catch {
      addChatMessage({
        id: nextMsgId('err'),
        role: 'system',
        content: 'Failed to get a response. Please try again.',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setChatLoading(false)
    }
  }, [chatMessages, listenForProgress])
```

**Note:** The `useRef`, `useEffect`, and `useCallback` imports should already exist in page.tsx. The implementer should verify and add any missing imports.

- [ ] **Step 3: Run build check**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run src/lib/chat/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/app/page.tsx
git commit -m "feat(chat): handle task creation responses and stream agent progress

Chat now sends conversation history for context-aware classification.
When a task is created and dispatched, starts SSE listener for real-time
agent progress messages inline in the chat panel."
```

---

### Task 6: Enhance ChatPanel to render task cards and progress

**Files:**
- Modify: `src/components/ChatPanel.tsx`

Add visual distinction for system messages that contain task progress — show them as compact status lines rather than full chat bubbles.

- [ ] **Step 1: Read ChatPanel.tsx**

Read: `src/components/ChatPanel.tsx`

- [ ] **Step 2: Add system message styling**

Find the message rendering section in ChatPanel (the map over messages) and update the message bubble rendering to handle system messages differently:

In the messages map, add a check before the existing bubble rendering:

```typescript
// Helper to render bold markdown safely (no dangerouslySetInnerHTML / XSS risk)
function renderBoldText(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  )
}

// For system messages, render as compact status lines
if (msg.role === 'system') {
  return (
    <div key={msg.id} className="px-4 py-1">
      <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
        {renderBoldText(msg.content)}
      </div>
    </div>
  )
}
```

**Note:** The exact location depends on the current ChatPanel structure. The implementer should read the full file first and insert the system message rendering at the appropriate spot in the message list rendering. The `renderBoldText` helper should be defined outside the component or at the top of the file.

- [ ] **Step 3: Verify visually (manual)**

Run the dev server and send a test message through the chat panel to confirm:
1. Regular messages render normally
2. System progress messages render as compact status lines
3. Bold formatting works (** ** → <strong>)

- [ ] **Step 4: Commit**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add src/components/ChatPanel.tsx
git commit -m "feat(chat): render system messages as compact status lines in chat

System messages (agent progress, task creation confirmations) now render
as compact text lines with bold formatting support, distinct from regular
chat bubbles."
```

---

### Task 7: Run full build and verify end-to-end

**Files:**
- Possibly modify any files with type errors

- [ ] **Step 1: Run full test suite**

Run: `cd /local/workplace/wabo/ocbot/octavius && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run production build**

Run: `cd /local/workplace/wabo/ocbot/octavius && npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Fix any type errors or test failures**

- [ ] **Step 4: Final commit if fixes needed**

```bash
cd /local/workplace/wabo/ocbot/octavius
git add -A
git commit -m "fix: resolve type errors from conversational orchestration integration"
```
