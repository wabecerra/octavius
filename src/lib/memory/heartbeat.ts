import type Database from 'better-sqlite3'
import type { HeartbeatProcess, ProcessStatus } from './models'

/**
 * HeartbeatMonitor tracks long-running agent processes and detects stalled or failed tasks.
 *
 * Operates on the `heartbeat_processes` table in SQLite.
 *
 * Lifecycle: active → stalled (missed heartbeats) | completed | failed
 */
export class HeartbeatMonitor {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * Register a new long-running process for heartbeat monitoring.
   *
   * @param processId - Unique identifier for the process
   * @param agentId - The agent that owns this process
   * @param intervalMs - Expected heartbeat interval in milliseconds
   * @returns The registered HeartbeatProcess
   * @throws If a process with the same processId already exists
   */
  register(processId: string, agentId: string, intervalMs: number): HeartbeatProcess {
    const now = new Date().toISOString()

    const process: HeartbeatProcess = {
      process_id: processId,
      agent_id: agentId,
      status: 'active',
      started_at: now,
      last_heartbeat: now,
      completed_at: null,
      heartbeat_interval_ms: intervalMs,
    }

    this.db
      .prepare(
        `INSERT INTO heartbeat_processes
         (process_id, agent_id, status, started_at, last_heartbeat, completed_at, heartbeat_interval_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        process.process_id,
        process.agent_id,
        process.status,
        process.started_at,
        process.last_heartbeat,
        process.completed_at,
        process.heartbeat_interval_ms,
      )

    return process
  }

  /**
   * Record a heartbeat for an active process, updating its last_heartbeat timestamp.
   *
   * @param processId - The process to heartbeat
   * @throws If the process does not exist or is not active
   */
  heartbeat(processId: string): void {
    const now = new Date().toISOString()

    const result = this.db
      .prepare(
        `UPDATE heartbeat_processes
         SET last_heartbeat = ?
         WHERE process_id = ? AND status = 'active'`,
      )
      .run(now, processId)

    if (result.changes === 0) {
      const exists = this.db
        .prepare('SELECT status FROM heartbeat_processes WHERE process_id = ?')
        .get(processId) as { status: ProcessStatus } | undefined

      if (!exists) {
        throw new Error(`Process not found: ${processId}`)
      }
      throw new Error(`Cannot heartbeat process in '${exists.status}' status: ${processId}`)
    }
  }

  /**
   * Mark a process as completed and record the completion timestamp.
   *
   * @param processId - The process to complete
   * @throws If the process does not exist
   */
  complete(processId: string): void {
    const now = new Date().toISOString()

    const result = this.db
      .prepare(
        `UPDATE heartbeat_processes
         SET status = 'completed', completed_at = ?
         WHERE process_id = ?`,
      )
      .run(now, processId)

    if (result.changes === 0) {
      throw new Error(`Process not found: ${processId}`)
    }
  }

  /**
   * Mark a process as failed.
   *
   * @param processId - The process to mark as failed
   * @throws If the process does not exist
   */
  fail(processId: string): void {
    const now = new Date().toISOString()

    const result = this.db
      .prepare(
        `UPDATE heartbeat_processes
         SET status = 'failed', completed_at = ?
         WHERE process_id = ?`,
      )
      .run(now, processId)

    if (result.changes === 0) {
      throw new Error(`Process not found: ${processId}`)
    }
  }

  /**
   * Find processes where now - last_heartbeat > 2 * heartbeat_interval_ms,
   * mark them as stalled, and return the stalled processes.
   */
  checkStalled(): HeartbeatProcess[] {
    const now = Date.now()

    // Fetch all active processes
    const activeRows = this.db
      .prepare(
        `SELECT * FROM heartbeat_processes WHERE status = 'active'`,
      )
      .all() as RawHeartbeatRow[]

    const stalledProcesses: HeartbeatProcess[] = []

    for (const row of activeRows) {
      const lastHeartbeatMs = new Date(row.last_heartbeat).getTime()
      const elapsed = now - lastHeartbeatMs
      const threshold = 2 * row.heartbeat_interval_ms

      if (elapsed > threshold) {
        // Mark as stalled
        this.db
          .prepare(
            `UPDATE heartbeat_processes SET status = 'stalled' WHERE process_id = ?`,
          )
          .run(row.process_id)

        stalledProcesses.push(rowToProcess({ ...row, status: 'stalled' }))
      }
    }

    return stalledProcesses
  }

  /**
   * Return all registered processes with their current status.
   */
  listAll(): HeartbeatProcess[] {
    const rows = this.db
      .prepare('SELECT * FROM heartbeat_processes')
      .all() as RawHeartbeatRow[]

    return rows.map(rowToProcess)
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawHeartbeatRow {
  process_id: string
  agent_id: string
  status: ProcessStatus
  started_at: string
  last_heartbeat: string
  completed_at: string | null
  heartbeat_interval_ms: number
}

function rowToProcess(row: RawHeartbeatRow): HeartbeatProcess {
  return {
    process_id: row.process_id,
    agent_id: row.agent_id,
    status: row.status,
    started_at: row.started_at,
    last_heartbeat: row.last_heartbeat,
    completed_at: row.completed_at,
    heartbeat_interval_ms: row.heartbeat_interval_ms,
  }
}
