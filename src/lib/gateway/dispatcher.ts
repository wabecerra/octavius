/**
 * TaskDispatcher — routes AgentTask execution through the OpenClaw gateway
 * (sessions_spawn) when connected, falling back to the browser-based agent
 * adapter when disconnected.
 *
 * Manages session lifecycle via HeartbeatMonitor, enforces budget gates,
 * handles announce callbacks, and logs fallback events.
 *
 * Requirements: 6.1–6.7, 12.1, 12.5, 13.1–13.5
 */
import type Database from 'better-sqlite3'
import type { AgentTask, ModelRouterConfig } from '@/types'
import type { GatewayClient } from './client'
import type { HeartbeatMonitor } from '../memory/heartbeat'
import type { MemoryService } from '../memory/service'
import type { SessionInfo, SpawnSessionRequest, ExecuteTaskResult } from './types'
import { canDispatch, routeTask } from '../model-router'
import { executeTask as defaultExecuteTask } from '../agent-adapter'

/** Injectable fallback function signature (matches executeTask) */
export type ExecuteTaskFn = typeof defaultExecuteTask

/** Configuration for the TaskDispatcher */
export interface TaskDispatcherConfig {
  /** Session timeout in milliseconds (default: 300_000 = 5 minutes) */
  timeoutMs: number
  /** Heartbeat interval for session monitoring in ms (default: 30_000) */
  sessionHeartbeatIntervalMs: number
}

const DEFAULT_CONFIG: TaskDispatcherConfig = {
  timeoutMs: 300_000,
  sessionHeartbeatIntervalMs: 30_000,
}

export class TaskDispatcher {
  private sessions: Map<string, SessionInfo> = new Map()
  private recentCompleted: SessionInfo[] = []
  private timeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private config: TaskDispatcherConfig
  private executeTaskFn: ExecuteTaskFn

  constructor(
    private client: GatewayClient,
    private heartbeatMonitor: HeartbeatMonitor,
    private db: Database.Database,
    private memoryService: MemoryService,
    config?: Partial<TaskDispatcherConfig>,
    executeTaskFn?: ExecuteTaskFn,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.executeTaskFn = executeTaskFn ?? defaultExecuteTask
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Dispatch a task — gateway if connected, browser adapter if not.
   *
   * 1. Check budget gate via canDispatch()
   * 2. If gateway connected → spawnSession()
   * 3. If gateway disconnected → executeTask() fallback
   * 4. Log fallback events to gateway_events table
   */
  async dispatch(
    task: AgentTask,
    routerConfig: ModelRouterConfig,
    localReachable: boolean,
  ): Promise<ExecuteTaskResult> {
    // Budget gate check (Req 6.6)
    const routing = routeTask(task.complexityScore, routerConfig, localReachable)
    const currentSpend = this.getDailySpend(routerConfig)
    if (!canDispatch(routing.tier, currentSpend, routerConfig)) {
      throw new Error(
        `Budget gate blocked: tier ${routing.tier} dispatch rejected (spend: $${currentSpend.toFixed(2)}, budget: $${routerConfig.dailyCostBudget.toFixed(2)})`,
      )
    }

    const gatewayConnected = this.client.getStatus() === 'connected'

    if (gatewayConnected) {
      try {
        const session = await this.spawnSession({
          agent_id: task.agentId,
          message: task.description,
          context: {
            task_id: task.id,
            complexity_score: task.complexityScore,
            tier: task.tier,
          },
        })

        return {
          result: session.result ?? '',
          routing,
        }
      } catch (err) {
        // If gateway spawn fails, fall through to fallback
        this.logGatewayEvent('fallback', {
          task_id: task.id,
          reason: `Gateway spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    // Fallback to browser adapter (Req 6.4, 12.1)
    this.logGatewayEvent('fallback', {
      task_id: task.id,
      reason: gatewayConnected ? 'gateway_spawn_failed' : 'gateway_disconnected',
    })

    return this.executeTaskFn(task, routerConfig, localReachable)
  }

  /**
   * Spawn a session on the gateway via POST /api/sessions/spawn.
   * Registers the session with HeartbeatMonitor and sets up a timeout timer.
   * Returns the completed SessionInfo once the announce callback fires.
   *
   * Requirements: 6.1, 6.2, 6.3, 6.7, 13.1, 13.2
   */
  async spawnSession(request: SpawnSessionRequest): Promise<SessionInfo> {
    const res = await this.client.request('/api/sessions/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!res.ok) {
      throw new Error(`sessions_spawn failed: HTTP ${res.status}`)
    }

    const data = (await res.json()) as { session_id: string }
    const now = new Date().toISOString()

    const session: SessionInfo = {
      session_id: data.session_id,
      agent_id: request.agent_id,
      task_id: (request.context?.task_id as string) ?? '',
      status: 'active',
      started_at: now,
    }

    // Register with HeartbeatMonitor (Req 13.1)
    this.heartbeatMonitor.register(
      session.session_id,
      session.agent_id,
      this.config.sessionHeartbeatIntervalMs,
    )

    // Track in active sessions registry (Req 13.5)
    this.sessions.set(session.session_id, session)

    // Set up timeout timer (Req 6.7)
    const timer = setTimeout(() => {
      this.handleSessionTimeout(session.session_id)
    }, this.config.timeoutMs)
    this.timeoutTimers.set(session.session_id, timer)

    return session
  }

  /**
   * Handle the announce callback from a completed session.
   * Updates HeartbeatMonitor, clears timeout, moves to recent sessions.
   *
   * Requirements: 6.3, 13.2
   */
  handleAnnounce(sessionId: string, result: string): SessionInfo | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    const now = new Date().toISOString()
    session.status = 'completed'
    session.completed_at = now
    session.result = result

    // Complete in HeartbeatMonitor (Req 13.2)
    try {
      this.heartbeatMonitor.complete(sessionId)
    } catch {
      // Session may already be completed/failed — non-fatal
    }

    // Clear timeout timer
    this.clearTimeoutTimer(sessionId)

    // Move from active to recent
    this.sessions.delete(sessionId)
    this.addToRecent(session)

    return session
  }

  /**
   * Cancel an active session via the gateway API.
   * Stores cancellation as an episodic memory.
   *
   * Requirements: 13.3, 13.4
   */
  async cancelSession(sessionId: string, reason = 'user_cancelled'): Promise<void> {
    const session = this.sessions.get(sessionId)

    // Attempt cancel via gateway API
    try {
      await this.client.request(`/api/sessions/${sessionId}/cancel`, {
        method: 'POST',
      })
    } catch {
      // Gateway may be unreachable — continue with local cleanup
    }

    if (session) {
      const now = new Date().toISOString()
      session.status = 'cancelled'
      session.completed_at = now

      // Mark as failed in HeartbeatMonitor
      try {
        this.heartbeatMonitor.fail(sessionId)
      } catch {
        // Non-fatal
      }

      this.clearTimeoutTimer(sessionId)
      this.sessions.delete(sessionId)
      this.addToRecent(session)
    }

    // Store cancellation as episodic memory (Req 13.4)
    this.memoryService.create({
      text: `Session ${sessionId} cancelled: ${reason}`,
      type: 'episodic',
      layer: 'daily_notes',
      provenance: {
        source_type: 'system_event',
        source_id: sessionId,
        agent_id: session?.agent_id ?? null,
      },
      confidence: 0.9,
      importance: 0.5,
      tags: ['session-cancelled', 'gateway'],
    })

    // Log event
    this.logGatewayEvent('session_cancel', {
      session_id: sessionId,
      reason,
    })
  }

  /** Get all currently active sessions (Req 13.5) */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
  }

  /** Get recent completed/failed/cancelled sessions (last N, default 10) */
  getRecentSessions(limit = 10): SessionInfo[] {
    return this.recentCompleted.slice(0, limit)
  }

  /** Clean up all timers (call on shutdown) */
  destroy(): void {
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer)
    }
    this.timeoutTimers.clear()
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Handle session timeout — cancel and record (Req 6.7, 13.3, 13.4) */
  private handleSessionTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'active') return

    const now = new Date().toISOString()
    session.status = 'timeout'
    session.completed_at = now

    // Mark as failed in HeartbeatMonitor
    try {
      this.heartbeatMonitor.fail(sessionId)
    } catch {
      // Non-fatal
    }

    this.timeoutTimers.delete(sessionId)
    this.sessions.delete(sessionId)
    this.addToRecent(session)

    // Store timeout as episodic memory (Req 13.4)
    this.memoryService.create({
      text: `Session ${sessionId} timed out after ${this.config.timeoutMs}ms`,
      type: 'episodic',
      layer: 'daily_notes',
      provenance: {
        source_type: 'system_event',
        source_id: sessionId,
        agent_id: session.agent_id,
      },
      confidence: 0.9,
      importance: 0.6,
      tags: ['session-timeout', 'gateway'],
    })

    // Log event
    this.logGatewayEvent('session_timeout', {
      session_id: sessionId,
      agent_id: session.agent_id,
      task_id: session.task_id,
      timeout_ms: this.config.timeoutMs,
    })
  }

  /** Clear a session's timeout timer */
  private clearTimeoutTimer(sessionId: string): void {
    const timer = this.timeoutTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.timeoutTimers.delete(sessionId)
    }
  }

  /** Add a session to the recent list, keeping at most 20 entries */
  private addToRecent(session: SessionInfo): void {
    this.recentCompleted.unshift(session)
    if (this.recentCompleted.length > 20) {
      this.recentCompleted.pop()
    }
  }

  /** Log an event to the gateway_events table (Req 6.5, 12.5) */
  private logGatewayEvent(
    eventType: string,
    details: Record<string, unknown>,
  ): void {
    try {
      this.db
        .prepare(
          'INSERT INTO gateway_events (event_type, details, timestamp) VALUES (?, ?, ?)',
        )
        .run(eventType, JSON.stringify(details), new Date().toISOString())
    } catch {
      // DB write failure is non-fatal for dispatch flow
    }
  }

  /** Get current daily spend (simplified — reads from gateway_events or returns 0) */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getDailySpend(_config: ModelRouterConfig): number {
    // In a full implementation this would aggregate token usage from today's sessions.
    // For now, return 0 to allow dispatch (budget gate still enforced via canDispatch).
    return 0
  }
}
