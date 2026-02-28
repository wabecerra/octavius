/**
 * Unit tests for TaskDispatcher.
 *
 * Covers: dispatch routing (gateway vs fallback), spawnSession, handleAnnounce,
 * cancelSession, session timeout, budget gate, active/recent session queries,
 * fallback event logging, and HeartbeatMonitor integration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDatabase, closeDatabase } from '../memory/db'
import { MemoryService } from '../memory/service'
import { HeartbeatMonitor } from '../memory/heartbeat'
import { GatewayClient, type FetchFn } from './client'
import { TaskDispatcher, type ExecuteTaskFn } from './dispatcher'
import type { AgentTask, ModelRouterConfig } from '@/types'
import type { ExecuteTaskResult } from './types'
import type Database from 'better-sqlite3'

// ── Helpers ───────────────────────────────────────────────────

function makeRouterConfig(overrides?: Partial<ModelRouterConfig>): ModelRouterConfig {
  return {
    localEndpoint: '',
    localModelName: 'llama3.2',
    tier1CloudModel: 'gemini-flash',
    tier2Model: 'claude-sonnet',
    tier3Model: 'claude-opus',
    researchProvider: 'kimi',
    dailyCostBudget: 10,
    tierCostRates: { 1: 0.001, 2: 0.01, 3: 0.1 },
    ...overrides,
  }
}

function makeTask(overrides?: Partial<AgentTask>): AgentTask {
  return {
    id: `task-${Date.now()}`,
    agentId: 'agent-orchestrator',
    description: 'Test task',
    complexityScore: 3,
    tier: 1,
    modelUsed: 'gemini-flash',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/** Create a mock GatewayClient with controllable status and fetch */
function createMockClient(
  status: 'connected' | 'disconnected',
  fetchResponses?: Array<{ status: number; body?: unknown }>,
): GatewayClient {
  let callIndex = 0
  const fetchFn: FetchFn = vi.fn(async () => {
    const resp = fetchResponses?.[callIndex] ?? { status: 200, body: {} }
    callIndex++
    return new Response(JSON.stringify(resp.body ?? {}), { status: resp.status })
  })

  const client = new GatewayClient({}, fetchFn)
  // Override getStatus to return the desired status
  vi.spyOn(client, 'getStatus').mockReturnValue(status)
  return client
}

/** Mock executeTask that returns a canned result */
const mockExecuteTask: ExecuteTaskFn = vi.fn(async (task, config, _localReachable) => {
  return {
    result: `fallback-result-for-${task.id}`,
    routing: { tier: 1 as const, model: config.tier1CloudModel, endpoint: 'mock', isLocal: false },
  }
})

describe('TaskDispatcher', () => {
  let db: Database.Database
  let memoryService: MemoryService
  let heartbeatMonitor: HeartbeatMonitor

  beforeEach(() => {
    vi.useFakeTimers()
    db = getDatabase(':memory:')
    memoryService = new MemoryService(db)
    heartbeatMonitor = new HeartbeatMonitor(db)
  })

  afterEach(() => {
    vi.useRealTimers()
    closeDatabase(db)
  })

  describe('dispatch() — gateway connected', () => {
    it('routes task through spawnSession when gateway is connected', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-1' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService, {
        timeoutMs: 5000,
      })

      const task = makeTask()

      // Spawn returns a session; we need to simulate announce to complete
      const dispatchPromise = dispatcher.spawnSession({
        agent_id: task.agentId,
        message: task.description,
        context: { task_id: task.id },
      })

      const session = await dispatchPromise
      expect(session.session_id).toBe('sess-1')
      expect(session.status).toBe('active')
      expect(session.agent_id).toBe(task.agentId)

      // Verify session is tracked
      expect(dispatcher.getActiveSessions()).toHaveLength(1)

      dispatcher.destroy()
    })

    it('falls back to browser adapter when gateway spawn fails', async () => {
      const client = createMockClient('connected', [
        { status: 500, body: { error: 'internal error' } },
      ])
      const mockFallback = vi.fn(async () => ({
        result: 'fallback-result',
        routing: { tier: 1 as const, model: 'gemini-flash', endpoint: 'mock', isLocal: false },
      })) as unknown as ExecuteTaskFn
      const dispatcher = new TaskDispatcher(
        client, heartbeatMonitor, db, memoryService, undefined, mockFallback,
      )

      const task = makeTask({ complexityScore: 2 })
      const result = await dispatcher.dispatch(task, makeRouterConfig(), false)

      expect(result.result).toBe('fallback-result')
      expect(mockFallback).toHaveBeenCalled()

      // Verify fallback event was logged
      const events = db
        .prepare("SELECT * FROM gateway_events WHERE event_type = 'fallback'")
        .all() as Array<{ event_type: string; details: string }>
      expect(events.length).toBeGreaterThanOrEqual(1)

      dispatcher.destroy()
    })
  })

  describe('dispatch() — gateway disconnected', () => {
    it('falls back to browser adapter and logs fallback event', async () => {
      const client = createMockClient('disconnected')
      const dispatcher = new TaskDispatcher(
        client, heartbeatMonitor, db, memoryService, undefined, mockExecuteTask,
      )

      const task = makeTask({ complexityScore: 2 })
      const result = await dispatcher.dispatch(task, makeRouterConfig(), false)

      expect(result.result).toBe(`fallback-result-for-${task.id}`)

      // Verify fallback event was logged with correct details
      const events = db
        .prepare("SELECT * FROM gateway_events WHERE event_type = 'fallback'")
        .all() as Array<{ event_type: string; details: string }>
      expect(events.length).toBeGreaterThanOrEqual(1)

      const details = JSON.parse(events[0]!.details)
      expect(details.task_id).toBe(task.id)
      expect(details.reason).toBe('gateway_disconnected')

      dispatcher.destroy()
    })
  })

  describe('spawnSession()', () => {
    it('registers session with HeartbeatMonitor', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-hb' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      await dispatcher.spawnSession({
        agent_id: 'agent-lifeforce',
        message: 'Check wellness',
        context: { task_id: 'task-1' },
      })

      // Verify HeartbeatMonitor has the session registered
      const processes = heartbeatMonitor.listAll()
      const sessionProcess = processes.find((p) => p.process_id === 'sess-hb')
      expect(sessionProcess).toBeDefined()
      expect(sessionProcess!.agent_id).toBe('agent-lifeforce')
      expect(sessionProcess!.status).toBe('active')

      dispatcher.destroy()
    })

    it('throws when gateway returns non-OK response', async () => {
      const client = createMockClient('connected', [
        { status: 503, body: { error: 'service unavailable' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      await expect(
        dispatcher.spawnSession({
          agent_id: 'agent-test',
          message: 'test',
        }),
      ).rejects.toThrow('sessions_spawn failed: HTTP 503')

      dispatcher.destroy()
    })
  })

  describe('handleAnnounce()', () => {
    it('completes session and moves to recent', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-ann' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      await dispatcher.spawnSession({
        agent_id: 'agent-industry',
        message: 'Do work',
        context: { task_id: 'task-ann' },
      })

      expect(dispatcher.getActiveSessions()).toHaveLength(1)

      const completed = dispatcher.handleAnnounce('sess-ann', 'Task completed successfully')

      expect(completed).not.toBeNull()
      expect(completed!.status).toBe('completed')
      expect(completed!.result).toBe('Task completed successfully')
      expect(completed!.completed_at).toBeTruthy()

      // Active sessions should be empty, recent should have the session
      expect(dispatcher.getActiveSessions()).toHaveLength(0)
      expect(dispatcher.getRecentSessions()).toHaveLength(1)
      expect(dispatcher.getRecentSessions()[0]!.session_id).toBe('sess-ann')

      dispatcher.destroy()
    })

    it('returns null for unknown session ID', () => {
      const client = createMockClient('connected')
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      const result = dispatcher.handleAnnounce('nonexistent', 'result')
      expect(result).toBeNull()

      dispatcher.destroy()
    })

    it('completes session in HeartbeatMonitor', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-hb-complete' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      await dispatcher.spawnSession({
        agent_id: 'agent-test',
        message: 'test',
        context: { task_id: 'task-hb' },
      })

      dispatcher.handleAnnounce('sess-hb-complete', 'done')

      // HeartbeatMonitor should show the process as completed
      const processes = heartbeatMonitor.listAll()
      const proc = processes.find((p) => p.process_id === 'sess-hb-complete')
      expect(proc).toBeDefined()
      expect(proc!.status).toBe('completed')

      dispatcher.destroy()
    })
  })

  describe('cancelSession()', () => {
    it('cancels session and stores episodic memory', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-cancel' } },
        { status: 200 }, // cancel response
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      await dispatcher.spawnSession({
        agent_id: 'agent-fellowship',
        message: 'Check connections',
        context: { task_id: 'task-cancel' },
      })

      await dispatcher.cancelSession('sess-cancel', 'user_requested')

      // Session should be removed from active
      expect(dispatcher.getActiveSessions()).toHaveLength(0)

      // Should be in recent with cancelled status
      const recent = dispatcher.getRecentSessions()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.status).toBe('cancelled')

      // Episodic memory should be stored
      const memories = memoryService.list({ source_type: 'system_event' })
      expect(memories.items.length).toBeGreaterThanOrEqual(1)
      const cancelMemory = memories.items.find((m) =>
        m.text.includes('sess-cancel'),
      )
      expect(cancelMemory).toBeDefined()
      expect(cancelMemory!.tags).toContain('session-cancelled')

      // Gateway event should be logged
      const events = db
        .prepare("SELECT * FROM gateway_events WHERE event_type = 'session_cancel'")
        .all() as Array<{ details: string }>
      expect(events).toHaveLength(1)

      dispatcher.destroy()
    })
  })

  describe('session timeout', () => {
    it('cancels session after timeout and stores episodic memory', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-timeout' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService, {
        timeoutMs: 1000,
      })

      await dispatcher.spawnSession({
        agent_id: 'agent-essence',
        message: 'Deep reflection',
        context: { task_id: 'task-timeout' },
      })

      expect(dispatcher.getActiveSessions()).toHaveLength(1)

      // Advance past timeout
      vi.advanceTimersByTime(1001)

      // Session should be moved to recent with timeout status
      expect(dispatcher.getActiveSessions()).toHaveLength(0)
      const recent = dispatcher.getRecentSessions()
      expect(recent).toHaveLength(1)
      expect(recent[0]!.status).toBe('timeout')

      // HeartbeatMonitor should show failed
      const processes = heartbeatMonitor.listAll()
      const proc = processes.find((p) => p.process_id === 'sess-timeout')
      expect(proc!.status).toBe('failed')

      // Episodic memory should be stored
      const memories = memoryService.list({ source_type: 'system_event' })
      const timeoutMemory = memories.items.find((m) =>
        m.text.includes('timed out'),
      )
      expect(timeoutMemory).toBeDefined()
      expect(timeoutMemory!.tags).toContain('session-timeout')

      // Gateway event should be logged
      const events = db
        .prepare("SELECT * FROM gateway_events WHERE event_type = 'session_timeout'")
        .all() as Array<{ details: string }>
      expect(events).toHaveLength(1)

      dispatcher.destroy()
    })
  })

  describe('budget gate', () => {
    it('rejects dispatch when budget is exceeded for tier 2+ tasks', async () => {
      const client = createMockClient('connected')
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      const task = makeTask({ complexityScore: 8, tier: 3 })
      const config = makeRouterConfig({ dailyCostBudget: 0 }) // zero budget

      await expect(
        dispatcher.dispatch(task, config, false),
      ).rejects.toThrow(/Budget gate blocked/)

      dispatcher.destroy()
    })

    it('allows tier 1 tasks even when budget is exceeded', async () => {
      const client = createMockClient('disconnected')
      const dispatcher = new TaskDispatcher(
        client, heartbeatMonitor, db, memoryService, undefined, mockExecuteTask,
      )

      const task = makeTask({ complexityScore: 2, tier: 1 })
      const config = makeRouterConfig({ dailyCostBudget: 0 })

      // Should NOT throw budget gate error — tier 1 always passes
      const result = await dispatcher.dispatch(task, config, false)
      expect(result.result).toContain('fallback-result')

      dispatcher.destroy()
    })
  })

  describe('getActiveSessions() / getRecentSessions()', () => {
    it('returns empty arrays initially', () => {
      const client = createMockClient('connected')
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      expect(dispatcher.getActiveSessions()).toEqual([])
      expect(dispatcher.getRecentSessions()).toEqual([])

      dispatcher.destroy()
    })

    it('getRecentSessions respects limit parameter', async () => {
      const responses = Array.from({ length: 5 }, (_, i) => ({
        status: 200,
        body: { session_id: `sess-${i}` },
      }))
      const client = createMockClient('connected', responses)
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService)

      // Spawn and complete 5 sessions
      for (let i = 0; i < 5; i++) {
        await dispatcher.spawnSession({
          agent_id: `agent-${i}`,
          message: `task ${i}`,
          context: { task_id: `task-${i}` },
        })
        dispatcher.handleAnnounce(`sess-${i}`, `result ${i}`)
      }

      expect(dispatcher.getRecentSessions(3)).toHaveLength(3)
      expect(dispatcher.getRecentSessions()).toHaveLength(5)

      dispatcher.destroy()
    })
  })

  describe('destroy()', () => {
    it('clears all timeout timers', async () => {
      const client = createMockClient('connected', [
        { status: 200, body: { session_id: 'sess-destroy' } },
      ])
      const dispatcher = new TaskDispatcher(client, heartbeatMonitor, db, memoryService, {
        timeoutMs: 60_000,
      })

      await dispatcher.spawnSession({
        agent_id: 'agent-test',
        message: 'test',
      })

      // destroy should not throw
      dispatcher.destroy()

      // Advancing timers should not trigger timeout handler
      vi.advanceTimersByTime(70_000)
      // If timeout handler ran, it would try to access the session — no error means cleanup worked
    })
  })
})
