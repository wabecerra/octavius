/**
 * GatewayJobScheduler — gateway-aware scheduled job management.
 *
 * CRUD operations for ScheduledAgentJob in SQLite, cron-based dispatch
 * through TaskDispatcher, max 50 enabled jobs enforcement, and run logging.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import type { ScheduledAgentJob } from './types'
import type { GatewayClient } from './client'
import type { TaskDispatcher } from './dispatcher'

/** Maximum number of enabled scheduled jobs allowed */
const MAX_ENABLED_JOBS = 50

/** SQLite row shape for scheduled_agent_jobs */
interface ScheduledJobRow {
  id: string
  name: string
  cron_expression: string
  agent_id: string
  task_template: string
  enabled: number
  created_at: string
  updated_at: string
}

/** Input for creating a new scheduled job */
export interface CreateScheduledJobInput {
  name: string
  cronExpression: string
  agentId: string
  taskTemplate: string
  enabled?: boolean
}

/** Input for updating an existing scheduled job */
export interface UpdateScheduledJobInput {
  name?: string
  cronExpression?: string
  agentId?: string
  taskTemplate?: string
  enabled?: boolean
}

/** Convert a SQLite row to a ScheduledAgentJob */
function rowToJob(row: ScheduledJobRow): ScheduledAgentJob {
  return {
    id: row.id,
    name: row.name,
    cronExpression: row.cron_expression,
    agentId: row.agent_id,
    taskTemplate: row.task_template,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class GatewayJobScheduler {
  constructor(
    private readonly db: Database.Database,
    private readonly client: GatewayClient,
    private readonly dispatcher: TaskDispatcher,
  ) {}

  // ── CRUD Operations ─────────────────────────────────────────

  /**
   * Create a new scheduled agent job.
   * Enforces the max 50 enabled jobs limit.
   *
   * Requirements: 10.1, 10.5, 10.7
   */
  create(input: CreateScheduledJobInput): ScheduledAgentJob {
    const enabled = input.enabled ?? true

    if (enabled) {
      const enabledCount = this.getEnabledCount()
      if (enabledCount >= MAX_ENABLED_JOBS) {
        throw new Error(
          `Cannot create enabled job: maximum of ${MAX_ENABLED_JOBS} enabled jobs reached (current: ${enabledCount})`,
        )
      }
    }

    const now = new Date().toISOString()
    const id = nanoid()

    this.db
      .prepare(
        `INSERT INTO scheduled_agent_jobs
          (id, name, cron_expression, agent_id, task_template, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.cronExpression, input.agentId, input.taskTemplate, enabled ? 1 : 0, now, now)

    return {
      id,
      name: input.name,
      cronExpression: input.cronExpression,
      agentId: input.agentId,
      taskTemplate: input.taskTemplate,
      enabled,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Get a scheduled job by ID.
   */
  getById(id: string): ScheduledAgentJob | null {
    const row = this.db
      .prepare('SELECT * FROM scheduled_agent_jobs WHERE id = ?')
      .get(id) as ScheduledJobRow | undefined

    return row ? rowToJob(row) : null
  }

  /**
   * Get a scheduled job by name.
   */
  getByName(name: string): ScheduledAgentJob | null {
    const row = this.db
      .prepare('SELECT * FROM scheduled_agent_jobs WHERE name = ?')
      .get(name) as ScheduledJobRow | undefined

    return row ? rowToJob(row) : null
  }

  /**
   * List all scheduled jobs, optionally filtered by enabled status.
   */
  list(enabledOnly?: boolean): ScheduledAgentJob[] {
    const query = enabledOnly
      ? 'SELECT * FROM scheduled_agent_jobs WHERE enabled = 1 ORDER BY created_at DESC'
      : 'SELECT * FROM scheduled_agent_jobs ORDER BY created_at DESC'

    const rows = this.db.prepare(query).all() as ScheduledJobRow[]
    return rows.map(rowToJob)
  }

  /**
   * Update an existing scheduled job.
   * Enforces max 50 enabled jobs when enabling a previously disabled job.
   *
   * Requirements: 10.4, 10.7
   */
  update(id: string, updates: UpdateScheduledJobInput): ScheduledAgentJob {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Scheduled job not found: ${id}`)
    }

    // Check enabled limit when enabling a disabled job
    if (updates.enabled === true && !existing.enabled) {
      const enabledCount = this.getEnabledCount()
      if (enabledCount >= MAX_ENABLED_JOBS) {
        throw new Error(
          `Cannot enable job: maximum of ${MAX_ENABLED_JOBS} enabled jobs reached (current: ${enabledCount})`,
        )
      }
    }

    const setClauses: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      values.push(updates.name)
    }
    if (updates.cronExpression !== undefined) {
      setClauses.push('cron_expression = ?')
      values.push(updates.cronExpression)
    }
    if (updates.agentId !== undefined) {
      setClauses.push('agent_id = ?')
      values.push(updates.agentId)
    }
    if (updates.taskTemplate !== undefined) {
      setClauses.push('task_template = ?')
      values.push(updates.taskTemplate)
    }
    if (updates.enabled !== undefined) {
      setClauses.push('enabled = ?')
      values.push(updates.enabled ? 1 : 0)
    }

    if (setClauses.length === 0) return existing

    const now = new Date().toISOString()
    setClauses.push('updated_at = ?')
    values.push(now)
    values.push(id)

    this.db
      .prepare(`UPDATE scheduled_agent_jobs SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values)

    return this.getById(id)!
  }

  /**
   * Delete a scheduled job by ID.
   *
   * Requirement: 10.4
   */
  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM scheduled_agent_jobs WHERE id = ?')
      .run(id)
    return result.changes > 0
  }

  // ── Dispatch ────────────────────────────────────────────────

  /**
   * Execute a scheduled job's task via the TaskDispatcher.
   * If the gateway is disconnected, logs a skip event instead.
   *
   * Requirements: 10.2, 10.3, 10.6
   */
  async executeJob(job: ScheduledAgentJob): Promise<void> {
    const startedAt = new Date().toISOString()

    // Skip if gateway disconnected (Req 10.6)
    if (this.client.getStatus() !== 'connected') {
      this.logGatewayEvent('job_skip', {
        job_id: job.id,
        job_name: job.name,
        reason: 'gateway_disconnected',
      })
      this.insertJobRun(job.name, startedAt, false, 'Skipped: gateway disconnected')
      return
    }

    try {
      // Build a minimal AgentTask for dispatch
      const task = {
        id: `scheduled-${job.id}-${Date.now()}`,
        agentId: job.agentId,
        description: job.taskTemplate,
        complexityScore: 5,
        tier: 2 as const,
        modelUsed: '',
        status: 'pending' as const,
        createdAt: startedAt,
      }

      await this.dispatcher.dispatch(
        task,
        // Use a permissive config for scheduled jobs
        {
          localEndpoint: '',
          localModelName: '',
          tier1CloudModel: 'gemini-flash',
          tier2Model: 'claude-sonnet',
          tier3Model: 'claude-opus',
          researchProvider: 'kimi',
          dailyCostBudget: 100,
          tierCostRates: { 1: 0.001, 2: 0.01, 3: 0.1 },
        },
        false,
      )

      this.insertJobRun(job.name, startedAt, true)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.insertJobRun(job.name, startedAt, false, errorMsg)
    }
  }

  /**
   * Manually trigger a job by ID.
   *
   * Requirement: 10.4
   */
  async triggerManual(id: string): Promise<void> {
    const job = this.getById(id)
    if (!job) {
      throw new Error(`Scheduled job not found: ${id}`)
    }
    await this.executeJob(job)
  }

  // ── Helpers ─────────────────────────────────────────────────

  /** Get the count of currently enabled jobs */
  getEnabledCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM scheduled_agent_jobs WHERE enabled = 1')
      .get() as { count: number }
    return row.count
  }

  /** Get run history for a job */
  getJobRuns(jobName: string, limit = 10): Array<{
    job_name: string
    started_at: string
    completed_at: string | null
    success: boolean
    error?: string
  }> {
    const rows = this.db
      .prepare(
        `SELECT job_name, started_at, completed_at, success, error
         FROM job_runs
         WHERE job_name = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(jobName, limit) as Array<{
      job_name: string
      started_at: string
      completed_at: string | null
      success: number
      error: string | null
    }>

    return rows.map((r) => ({
      job_name: r.job_name,
      started_at: r.started_at,
      completed_at: r.completed_at,
      success: r.success === 1,
      ...(r.error ? { error: r.error } : {}),
    }))
  }

  // ── Private ─────────────────────────────────────────────────

  private insertJobRun(
    jobName: string,
    startedAt: string,
    success: boolean,
    error?: string,
  ): void {
    const completedAt = new Date().toISOString()
    try {
      this.db
        .prepare(
          `INSERT INTO job_runs (job_name, started_at, completed_at, success, details, error)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(jobName, startedAt, completedAt, success ? 1 : 0, '{}', error ?? null)
    } catch {
      // DB write failure is non-fatal
    }
  }

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
      // Non-fatal
    }
  }
}
