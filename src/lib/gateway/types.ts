/**
 * Gateway-specific type definitions for the OpenClaw Gateway Integration.
 *
 * Shared across all gateway subsystems: client, provisioner, dispatcher,
 * orchestrator-router, store slice, and UI components.
 */

// Re-export ExecuteTaskResult so gateway consumers import from one place
export type { ExecuteTaskResult } from '@/lib/agent-adapter'

/** Connection state of the local OpenClaw gateway */
export type GatewayStatus = 'connected' | 'disconnected' | 'degraded' | 'unknown'

/** Configuration for the GatewayClient connection and health monitoring */
export interface GatewayClientConfig {
  /** Gateway hostname (default: 'localhost') */
  address: string
  /** Gateway port (default: 18789) */
  port: number
  /** Interval between health check pings in ms (default: 30_000) */
  healthCheckIntervalMs: number
  /** Interval between reconnect attempts in ms (default: 60_000) */
  reconnectIntervalMs: number
  /** Consecutive health-check failures before transitioning to disconnected (default: 3) */
  maxConsecutiveFailures: number
}

/** Event signatures emitted by GatewayClient */
export interface GatewayEvents {
  status_changed: (status: GatewayStatus, previous: GatewayStatus) => void
  gateway_connected: (timestamp: string) => void
  gateway_disconnected: (timestamp: string) => void
  gateway_reconnected: (timestamp: string) => void
  health_check: (success: boolean, timestamp: string) => void
}

/** Summary returned after a workspace provisioning run */
export interface ProvisionResult {
  /** File paths that were written to disk */
  created: string[]
  /** File paths that already existed and were left untouched */
  skipped: string[]
  /** Files that failed to write */
  errors: Array<{ path: string; error: string }>
  /** Per-agent registration outcomes */
  registrations: Array<{
    agentId: string
    status: 'registered' | 'pending' | 'failed'
    error?: string
  }>
}

/** Configuration for a single proactive heartbeat action */
export interface HeartbeatActionConfig {
  name: string
  description: string
  enabled: boolean
  /** Memory Service endpoint to query (e.g. '/api/memory/search') */
  memoryApiEndpoint: string
  /** Query parameters sent to the endpoint */
  queryParams: Record<string, unknown>
  /** Human-readable condition that determines if the action is actionable */
  conditionLogic: string
  /** Template string for the notification created when the condition is met */
  notificationTemplate: string
}

/** Payload sent to POST /api/sessions/spawn */
export interface SpawnSessionRequest {
  agent_id: string
  message: string
  context?: Record<string, unknown>
}

/** Tracked session metadata */
export interface SessionInfo {
  session_id: string
  agent_id: string
  task_id: string
  status: 'active' | 'completed' | 'failed' | 'cancelled' | 'timeout'
  started_at: string
  completed_at?: string
  result?: string
}

/** Result of the orchestrator's sub-agent routing decision */
export interface DelegationDecision {
  targetAgentId: string
  /** Quadrant tag for context scoping */
  quadrantContext?: string
  reason: string
}

/** A single message in the conversational interface */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentId?: string
  timestamp: string
}

/** A user-defined recurring agent task persisted in SQLite */
export interface ScheduledAgentJob {
  id: string
  name: string
  cronExpression: string
  agentId: string
  taskTemplate: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** An entry in the gateway event log (fallback events, status transitions, etc.) */
export interface GatewayEvent {
  id: number
  eventType: 'fallback' | 'status_change' | 'session_timeout' | 'session_cancel' | 'job_skip'
  details: Record<string, unknown>
  timestamp: string
}
