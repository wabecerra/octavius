import type Database from 'better-sqlite3'
import cron, { type ScheduledTask } from 'node-cron'
import type { JobRunLog } from './models'

interface RegisteredJob {
  name: string
  cronExpression: string
  handler: () => Promise<void>
  task: ScheduledTask | null
}

/**
 * JobScheduler wraps node-cron to provide named, cron-scheduled jobs with
 * automatic run logging to the `job_runs` SQLite table.
 *
 * Lifecycle: register → start (schedules all) → stop (halts all).
 * Manual runs via triggerManual() bypass the cron schedule.
 */
export class JobScheduler {
  private db: Database.Database
  private jobs: Map<string, RegisteredJob> = new Map()

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * Register a named job with a cron expression and async handler.
   * Does not start the job — call start() to activate all registered jobs.
   *
   * @throws If a job with the same name is already registered
   */
  register(name: string, cronExpression: string, handler: () => Promise<void>): void {
    if (this.jobs.has(name)) {
      throw new Error(`Job already registered: ${name}`)
    }

    this.jobs.set(name, {
      name,
      cronExpression,
      handler,
      task: null,
    })
  }

  /**
   * Start all registered cron jobs. Each trigger executes the handler
   * and logs the result to the job_runs table.
   */
  start(): void {
    for (const job of this.jobs.values()) {
      if (job.task) continue // already started

      job.task = cron.schedule(job.cronExpression, async () => {
        await this.executeJob(job)
      })
    }
  }

  /** Stop all running cron tasks. */
  stop(): void {
    for (const job of this.jobs.values()) {
      if (job.task) {
        job.task.stop()
        job.task = null
      }
    }
  }

  /**
   * Return the most recent JobRunLog for the given job name, or null if
   * the job has never run.
   */
  getLastRun(name: string): JobRunLog | null {
    const row = this.db
      .prepare(
        `SELECT job_name, started_at, completed_at, success, details, error
         FROM job_runs
         WHERE job_name = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(name) as RawJobRunRow | undefined

    if (!row) return null
    return rowToJobRunLog(row)
  }

  /**
   * Immediately execute a registered job (bypassing the cron schedule).
   * Useful for testing and manual triggers from the API.
   *
   * @throws If the job name is not registered
   */
  async triggerManual(name: string): Promise<JobRunLog> {
    const job = this.jobs.get(name)
    if (!job) {
      throw new Error(`Job not registered: ${name}`)
    }
    return this.executeJob(job)
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async executeJob(job: RegisteredJob): Promise<JobRunLog> {
    const startedAt = new Date().toISOString()

    try {
      await job.handler()

      const completedAt = new Date().toISOString()
      const log: JobRunLog = {
        job_name: job.name,
        started_at: startedAt,
        completed_at: completedAt,
        success: true,
        details: {},
      }

      this.insertJobRun(log)
      return log
    } catch (err: unknown) {
      const completedAt = new Date().toISOString()
      const errorMessage = err instanceof Error ? err.message : String(err)

      const log: JobRunLog = {
        job_name: job.name,
        started_at: startedAt,
        completed_at: completedAt,
        success: false,
        details: {},
        error: errorMessage,
      }

      this.insertJobRun(log)
      return log
    }
  }

  private insertJobRun(log: JobRunLog): void {
    this.db
      .prepare(
        `INSERT INTO job_runs (job_name, started_at, completed_at, success, details, error)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        log.job_name,
        log.started_at,
        log.completed_at,
        log.success ? 1 : 0,
        JSON.stringify(log.details),
        log.error ?? null,
      )
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawJobRunRow {
  job_name: string
  started_at: string
  completed_at: string
  success: number
  details: string
  error: string | null
}

function rowToJobRunLog(row: RawJobRunRow): JobRunLog {
  const log: JobRunLog = {
    job_name: row.job_name,
    started_at: row.started_at,
    completed_at: row.completed_at,
    success: row.success === 1,
    details: JSON.parse(row.details) as Record<string, unknown>,
  }
  if (row.error) {
    log.error = row.error
  }
  return log
}
