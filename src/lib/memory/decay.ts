import type Database from 'better-sqlite3'
import type { JobRunLog } from './models'

/** Row shape for decay-relevant fields from memory_items. */
interface DecayRow {
  memory_id: string
  layer: string
  importance: number
  last_accessed: string
}

/**
 * Compute the decay score for a memory item.
 *
 * Formula: importance * (1 / (1 + daysSinceAccess))
 *
 * - A recently accessed, high-importance item scores close to its importance value.
 * - An old, low-importance item scores near zero.
 */
export function computeDecayScore(importance: number, lastAccessed: string): number {
  const lastAccessedMs = new Date(lastAccessed).getTime()
  const nowMs = Date.now()
  const daysSinceAccess = Math.max(0, (nowMs - lastAccessedMs) / (1000 * 60 * 60 * 24))
  return importance * (1 / (1 + daysSinceAccess))
}

/**
 * Run the decay job: compute decay scores for all non-archived, non-tacit_knowledge
 * items, archive those below the archive threshold, and delete those below the
 * deletion threshold.
 *
 * @param db - SQLite database connection
 * @param archiveThreshold - Items with decay score below this are archived (default 0.2)
 * @param deletionThreshold - Items with decay score below this are deleted (default 0.05)
 * @returns JobRunLog with counts of archived and deleted items
 */
export function runDecay(
  db: Database.Database,
  archiveThreshold: number,
  deletionThreshold: number,
): JobRunLog {
  const startedAt = new Date().toISOString()
  let archivedCount = 0
  let deletedCount = 0

  try {
    // Select all non-archived items, excluding tacit_knowledge layer
    const rows = db
      .prepare(
        `SELECT memory_id, layer, importance, last_accessed
         FROM memory_items
         WHERE archived = 0 AND layer != 'tacit_knowledge'`,
      )
      .all() as DecayRow[]

    const toArchive: string[] = []
    const toDelete: string[] = []

    for (const row of rows) {
      const score = computeDecayScore(row.importance, row.last_accessed)

      if (score < deletionThreshold) {
        toDelete.push(row.memory_id)
      } else if (score < archiveThreshold) {
        toArchive.push(row.memory_id)
      }
    }

    // Archive items
    if (toArchive.length > 0) {
      const archiveStmt = db.prepare(
        'UPDATE memory_items SET archived = 1 WHERE memory_id = ?',
      )
      for (const id of toArchive) {
        archiveStmt.run(id)
      }
      archivedCount = toArchive.length
    }

    // Delete items
    if (toDelete.length > 0) {
      const deleteStmt = db.prepare(
        'DELETE FROM memory_items WHERE memory_id = ?',
      )
      for (const id of toDelete) {
        deleteStmt.run(id)
      }
      deletedCount = toDelete.length
    }

    const completedAt = new Date().toISOString()
    return {
      job_name: 'decay',
      started_at: startedAt,
      completed_at: completedAt,
      success: true,
      details: {
        items_evaluated: rows.length,
        items_archived: archivedCount,
        items_deleted: deletedCount,
      },
    }
  } catch (err: unknown) {
    const completedAt = new Date().toISOString()
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      job_name: 'decay',
      started_at: startedAt,
      completed_at: completedAt,
      success: false,
      details: { items_archived: archivedCount, items_deleted: deletedCount },
      error: errorMessage,
    }
  }
}
