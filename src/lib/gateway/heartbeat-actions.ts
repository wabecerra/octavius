/**
 * HeartbeatActionExecutor — executes configured heartbeat actions on
 * each heartbeat cycle, querying the Memory Service and creating
 * notifications + episodic memories for actionable findings.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */
import type Database from 'better-sqlite3'
import type { HeartbeatActionConfig } from './types'
import type { GatewayClient } from './client'
import type { MemoryService } from '../memory/service'

/** Result of executing a single heartbeat action */
export interface HeartbeatActionResult {
  actionName: string
  triggered: boolean
  notification?: {
    actionType: string
    description: string
    suggestedNextStep: string
  }
  error?: string
}

/** Injectable fetch for querying the Memory Service API */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

/** Notification stored in the notifications table or emitted as an event */
export interface HeartbeatNotification {
  id: number
  actionType: string
  description: string
  suggestedNextStep: string
  timestamp: string
}

/**
 * Default heartbeat actions as specified in Requirement 9.2:
 * - Overdue tasks (Industry quadrant)
 * - Stale connections not contacted in 14+ days (Fellowship quadrant)
 * - Missed wellness check-ins in last 48 hours (Lifeforce quadrant)
 * - Stalled goals with no progress in 7+ days (all quadrants)
 */
export const DEFAULT_HEARTBEAT_ACTIONS: HeartbeatActionConfig[] = [
  {
    name: 'overdue-tasks',
    description: 'Check for overdue tasks in the Industry quadrant',
    enabled: true,
    memoryApiEndpoint: '/api/memory/items',
    queryParams: {
      type: 'episodic',
      tags: 'agent-task,task-completed',
      quadrant: 'career',
      limit: 10,
    },
    conditionLogic: 'Any task with dueDate in the past and completed=false',
    notificationTemplate: 'You have overdue tasks that need attention. Review your Industry quadrant.',
  },
  {
    name: 'stale-connections',
    description: 'Check for connections not contacted in over 14 days',
    enabled: true,
    memoryApiEndpoint: '/api/memory/items',
    queryParams: {
      type: 'episodic',
      tags: 'connection,contact',
      quadrant: 'relationships',
      limit: 20,
    },
    conditionLogic: 'Any connection with lastContactDate older than 14 days',
    notificationTemplate: 'Some connections have not been contacted in over 14 days. Consider reaching out.',
  },
  {
    name: 'missed-wellness',
    description: 'Check for missed wellness check-ins in the last 48 hours',
    enabled: true,
    memoryApiEndpoint: '/api/memory/items',
    queryParams: {
      type: 'episodic',
      tags: 'wellness,check-in',
      quadrant: 'health',
      limit: 5,
    },
    conditionLogic: 'No wellness check-in recorded in the last 48 hours',
    notificationTemplate: 'You have not logged a wellness check-in in over 48 hours. How are you feeling?',
  },
  {
    name: 'stalled-goals',
    description: 'Check for goals with no progress updates in the last 7 days',
    enabled: true,
    memoryApiEndpoint: '/api/memory/items',
    queryParams: {
      type: 'episodic',
      tags: 'goal,progress',
      limit: 20,
    },
    conditionLogic: 'Any goal with no progress update in the last 7 days',
    notificationTemplate: 'Some goals have had no progress updates in over a week. Review your goals.',
  },
]

export class HeartbeatActionExecutor {
  private memoryServiceBaseUrl: string

  constructor(
    private readonly db: Database.Database,
    private readonly client: GatewayClient,
    private readonly memoryService: MemoryService,
    private readonly fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
    memoryServiceBaseUrl = 'http://localhost:3000',
  ) {
    this.memoryServiceBaseUrl = memoryServiceBaseUrl
  }

  /**
   * Execute all enabled heartbeat actions.
   * Skips entirely when gateway is disconnected (Req 9.6).
   *
   * Requirements: 9.1, 9.6
   */
  async executeAll(actions: HeartbeatActionConfig[]): Promise<HeartbeatActionResult[]> {
    // Skip all actions when gateway is disconnected (Req 9.6)
    if (this.client.getStatus() !== 'connected') {
      return []
    }

    const enabledActions = actions.filter((a) => a.enabled)
    const results: HeartbeatActionResult[] = []

    for (const action of enabledActions) {
      const result = await this.executeAction(action)
      results.push(result)
    }

    return results
  }

  /**
   * Execute a single heartbeat action.
   *
   * 1. Query the Memory Service endpoint
   * 2. Evaluate the condition against the response
   * 3. If actionable, create notification + episodic memory
   *
   * Requirements: 9.1, 9.3, 9.4
   */
  async executeAction(action: HeartbeatActionConfig): Promise<HeartbeatActionResult> {
    try {
      // Query Memory Service endpoint
      const queryString = buildQueryString(action.queryParams)
      const url = `${this.memoryServiceBaseUrl}${action.memoryApiEndpoint}${queryString}`

      const res = await this.fetchFn(url, {
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        return {
          actionName: action.name,
          triggered: false,
          error: `Memory Service returned HTTP ${res.status}`,
        }
      }

      const data = await res.json()

      // Evaluate condition — check if there are actionable items
      const isActionable = evaluateCondition(data, action)

      if (!isActionable) {
        return { actionName: action.name, triggered: false }
      }

      // Create notification (Req 9.3)
      const notification = {
        actionType: action.name,
        description: action.description,
        suggestedNextStep: action.notificationTemplate,
      }

      this.storeNotification(notification)

      // Store episodic memory (Req 9.4)
      this.memoryService.create({
        text: `Heartbeat action "${action.name}" triggered: ${action.notificationTemplate}`,
        type: 'episodic',
        layer: 'daily_notes',
        provenance: {
          source_type: 'system_event',
          source_id: `heartbeat-${action.name}-${Date.now()}`,
          agent_id: null,
        },
        confidence: 0.9,
        importance: 0.6,
        tags: ['heartbeat-action', action.name],
      })

      return {
        actionName: action.name,
        triggered: true,
        notification,
      }
    } catch (err) {
      // Memory Service unreachable — skip action, log warning (Req 9.1)
      return {
        actionName: action.name,
        triggered: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // ── Heartbeat Action CRUD (SQLite persistence) ──────────────

  /**
   * Load heartbeat actions from SQLite.
   *
   * Requirement: 9.5
   */
  loadActions(): HeartbeatActionConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM heartbeat_actions ORDER BY name')
      .all() as HeartbeatActionRow[]

    return rows.map(rowToAction)
  }

  /**
   * Save (upsert) a heartbeat action to SQLite.
   *
   * Requirement: 9.5
   */
  saveAction(action: HeartbeatActionConfig): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT OR REPLACE INTO heartbeat_actions
          (name, description, enabled, memory_api_endpoint, query_params, condition_logic, notification_template, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        action.name,
        action.description,
        action.enabled ? 1 : 0,
        action.memoryApiEndpoint,
        JSON.stringify(action.queryParams),
        action.conditionLogic,
        action.notificationTemplate,
        now,
      )
  }

  /**
   * Save all default heartbeat actions to SQLite (idempotent).
   */
  initializeDefaults(): void {
    for (const action of DEFAULT_HEARTBEAT_ACTIONS) {
      // Only insert if not already present
      const existing = this.db
        .prepare('SELECT name FROM heartbeat_actions WHERE name = ?')
        .get(action.name)
      if (!existing) {
        this.saveAction(action)
      }
    }
  }

  /**
   * Toggle an action's enabled state.
   *
   * Requirement: 9.5
   */
  toggleAction(name: string, enabled: boolean): void {
    const now = new Date().toISOString()
    this.db
      .prepare('UPDATE heartbeat_actions SET enabled = ?, updated_at = ? WHERE name = ?')
      .run(enabled ? 1 : 0, now, name)
  }

  /**
   * Delete a heartbeat action.
   */
  deleteAction(name: string): boolean {
    const result = this.db
      .prepare('DELETE FROM heartbeat_actions WHERE name = ?')
      .run(name)
    return result.changes > 0
  }

  // ── Private ─────────────────────────────────────────────────

  /** Store a notification in the gateway_events table */
  private storeNotification(notification: {
    actionType: string
    description: string
    suggestedNextStep: string
  }): void {
    try {
      this.db
        .prepare(
          'INSERT INTO gateway_events (event_type, details, timestamp) VALUES (?, ?, ?)',
        )
        .run(
          'heartbeat_notification',
          JSON.stringify(notification),
          new Date().toISOString(),
        )
    } catch {
      // Non-fatal
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────

interface HeartbeatActionRow {
  name: string
  description: string
  enabled: number
  memory_api_endpoint: string
  query_params: string
  condition_logic: string
  notification_template: string
  updated_at: string
}

function rowToAction(row: HeartbeatActionRow): HeartbeatActionConfig {
  return {
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    memoryApiEndpoint: row.memory_api_endpoint,
    queryParams: JSON.parse(row.query_params) as Record<string, unknown>,
    conditionLogic: row.condition_logic,
    notificationTemplate: row.notification_template,
  }
}

/** Build a URL query string from a params object */
function buildQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of entries) {
    searchParams.set(key, String(value))
  }
  return `?${searchParams.toString()}`
}

/**
 * Evaluate whether the Memory Service response indicates an actionable condition.
 *
 * Simple heuristic: if the response contains items (total > 0 or items array non-empty),
 * the condition is considered met. More sophisticated condition evaluation could
 * parse the conditionLogic string, but for the MVP this covers the common case.
 */
function evaluateCondition(
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _action: HeartbeatActionConfig,
): boolean {
  // Check for items array with content
  if (Array.isArray(data.items) && data.items.length > 0) {
    return true
  }

  // Check for total count
  if (typeof data.total === 'number' && data.total > 0) {
    return true
  }

  return false
}
