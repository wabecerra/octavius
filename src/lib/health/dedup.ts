import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ReadingType } from './types'

/**
 * Computes a source-independent SHA-256 deduplication key for a health reading.
 * The key is derived from reading type, timestamp, and sorted data values —
 * deliberately excluding the source so the same measurement from CSV and webhook
 * is detected as a duplicate.
 */
export function computeDedupKey(
  readingType: ReadingType,
  timestamp: string,
  values: Record<string, unknown>,
): string {
  const sortedKeys = Object.keys(values).sort()
  const sortedValues: Record<string, unknown> = {}
  for (const key of sortedKeys) {
    sortedValues[key] = values[key]
  }
  const input = `${readingType}:${timestamp}:${JSON.stringify(sortedValues)}`
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Checks whether a reading with the given dedup key already exists in the
 * memory_items table. The dedup key is stored as `source_id` with
 * `source_type = 'device_sync'` in the provenance columns.
 */
export function isDuplicate(dedupKey: string, db: Database.Database): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM memory_items WHERE source_id = ? AND source_type = 'device_sync' LIMIT 1`,
    )
    .get(dedupKey)
  return row !== undefined
}
