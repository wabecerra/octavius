import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import type { JobRunLog, MemoryItem } from './models'

/** Row shape from the memory_items table. */
interface MemoryRow {
  memory_id: string
  text: string
  type: string
  layer: string
  source_type: string
  source_id: string
  agent_id: string | null
  created_at: string
  last_accessed: string
  confidence: number
  importance: number
  tags: string // JSON array
  embedding_ref: string | null
  consolidated_into: string | null
  archived: number
}

function rowToMemoryItem(row: MemoryRow): MemoryItem {
  return {
    memory_id: row.memory_id,
    text: row.text,
    type: row.type as MemoryItem['type'],
    layer: row.layer as MemoryItem['layer'],
    provenance: {
      source_type: row.source_type as MemoryItem['provenance']['source_type'],
      source_id: row.source_id,
      agent_id: row.agent_id,
    },
    created_at: row.created_at,
    last_accessed: row.last_accessed,
    confidence: row.confidence,
    importance: row.importance,
    tags: JSON.parse(row.tags) as string[],
    embedding_ref: row.embedding_ref,
    consolidated_into: row.consolidated_into,
    archived: row.archived === 1,
  }
}

/**
 * Extract the quadrant tag from a memory item's tags array.
 * Returns the quadrant id (e.g. "lifeforce") or null if no quadrant tag is present.
 */
function extractQuadrant(tags: string[]): string | null {
  for (const tag of tags) {
    if (tag.startsWith('quadrant:')) {
      return tag.slice('quadrant:'.length)
    }
  }
  return null
}

/**
 * Get non-quadrant tags from a tags array (used for grouping within a quadrant).
 */
function getNonQuadrantTags(tags: string[]): string[] {
  return tags.filter((t) => !t.startsWith('quadrant:'))
}

/**
 * Build a grouping key from quadrant + shared tags.
 * Items with the same key will be consolidated together.
 */
function groupKey(quadrant: string | null, tags: string[]): string {
  const nonQuadrant = getNonQuadrantTags(tags).sort()
  return `${quadrant ?? 'none'}::${nonQuadrant.join(',')}`
}

/**
 * Produce a summary text for a group of daily notes.
 */
function summarizeGroup(items: MemoryItem[]): string {
  const texts = items.map((item) => `- ${item.text}`)
  const quadrant = extractQuadrant(items[0].tags)
  const sharedTags = getNonQuadrantTags(items[0].tags)

  const header = quadrant
    ? `Consolidated from ${items.length} daily notes (${quadrant})`
    : `Consolidated from ${items.length} daily notes`

  const tagLine = sharedTags.length > 0 ? `\nTags: ${sharedTags.join(', ')}` : ''

  return `${header}${tagLine}\n\n${texts.join('\n')}`
}

/**
 * Run the consolidation job: select unconsolidated daily_notes since lastRunTimestamp,
 * group by quadrant tag then shared tags, create consolidated life_directory items,
 * and mark source items with consolidated_into.
 *
 * Errors on individual groups are caught and logged; processing continues.
 */
export function runConsolidation(
  db: Database.Database,
  lastRunTimestamp?: string,
): JobRunLog {
  const startedAt = new Date().toISOString()
  let notesProcessed = 0
  let itemsConsolidated = 0
  const errors: string[] = []

  try {
    // Select unconsolidated daily_notes since last run
    let query = `SELECT * FROM memory_items WHERE layer = 'daily_notes' AND consolidated_into IS NULL AND archived = 0`
    const params: unknown[] = []

    if (lastRunTimestamp) {
      query += ' AND created_at > ?'
      params.push(lastRunTimestamp)
    }

    const rows = db.prepare(query).all(...params) as MemoryRow[]
    const items = rows.map(rowToMemoryItem)

    if (items.length === 0) {
      const completedAt = new Date().toISOString()
      return {
        job_name: 'consolidation',
        started_at: startedAt,
        completed_at: completedAt,
        success: true,
        details: { notes_processed: 0, items_consolidated: 0 },
      }
    }

    // Group by quadrant tag, then by shared tags within quadrant
    const groups = new Map<string, MemoryItem[]>()
    for (const item of items) {
      const key = groupKey(extractQuadrant(item.tags), item.tags)
      const group = groups.get(key) ?? []
      group.push(item)
      groups.set(key, group)
    }

    // Process each group
    for (const groupItems of Array.from(groups.values())) {
      try {
        const now = new Date().toISOString()
        const consolidatedId = nanoid()
        const quadrant = extractQuadrant(groupItems[0].tags)

        // Build tags for the consolidated item
        const consolidatedTags: string[] = []
        if (quadrant) {
          consolidatedTags.push(`quadrant:${quadrant}`)
        }
        // Add shared non-quadrant tags
        const sharedNonQuadrant = getNonQuadrantTags(groupItems[0].tags)
        consolidatedTags.push(...sharedNonQuadrant)

        // Compute average confidence and importance
        const avgConfidence =
          groupItems.reduce((sum, i) => sum + i.confidence, 0) / groupItems.length
        const avgImportance =
          groupItems.reduce((sum, i) => sum + i.importance, 0) / groupItems.length

        const summaryText = summarizeGroup(groupItems)

        // Insert consolidated life_directory item
        db.prepare(
          `INSERT INTO memory_items
           (memory_id, text, type, layer, source_type, source_id, agent_id,
            created_at, last_accessed, confidence, importance, tags,
            embedding_ref, consolidated_into, archived)
           VALUES (?, ?, 'semantic', 'life_directory', 'consolidation', ?, NULL,
                   ?, ?, ?, ?, ?, NULL, NULL, 0)`,
        ).run(
          consolidatedId,
          summaryText,
          `consolidation-${startedAt}`,
          now,
          now,
          Math.min(1, Math.max(0, avgConfidence)),
          Math.min(1, Math.max(0, avgImportance)),
          JSON.stringify(consolidatedTags),
        )

        // Mark source items with consolidated_into
        const updateStmt = db.prepare(
          'UPDATE memory_items SET consolidated_into = ? WHERE memory_id = ?',
        )
        for (const item of groupItems) {
          updateStmt.run(consolidatedId, item.memory_id)
        }

        notesProcessed += groupItems.length
        itemsConsolidated++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(msg)
      }
    }

    const completedAt = new Date().toISOString()
    const log: JobRunLog = {
      job_name: 'consolidation',
      started_at: startedAt,
      completed_at: completedAt,
      success: errors.length === 0,
      details: {
        notes_processed: notesProcessed,
        items_consolidated: itemsConsolidated,
        errors: errors.length > 0 ? errors : undefined,
      },
    }
    if (errors.length > 0) {
      log.error = errors.join('; ')
    }
    return log
  } catch (err: unknown) {
    const completedAt = new Date().toISOString()
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      job_name: 'consolidation',
      started_at: startedAt,
      completed_at: completedAt,
      success: false,
      details: { notes_processed: notesProcessed, items_consolidated: itemsConsolidated },
      error: errorMessage,
    }
  }
}
