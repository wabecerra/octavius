import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { MemoryService } from './service'
import { runConsolidation } from './consolidation'

describe('ConsolidationJob', () => {
  let db: Database.Database
  let svc: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    svc = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  function createDailyNote(text: string, tags: string[], overrides?: { confidence?: number; importance?: number }) {
    return svc.create({
      text,
      type: 'episodic',
      layer: 'daily_notes',
      provenance: { source_type: 'user_input', source_id: 'test', agent_id: null },
      tags,
      confidence: overrides?.confidence ?? 0.8,
      importance: overrides?.importance ?? 0.6,
    })
  }

  it('returns success with zero counts when no daily notes exist', () => {
    const log = runConsolidation(db)

    expect(log.job_name).toBe('consolidation')
    expect(log.success).toBe(true)
    expect(log.details.notes_processed).toBe(0)
    expect(log.details.items_consolidated).toBe(0)
  })

  it('consolidates daily notes into life_directory items grouped by quadrant', () => {
    createDailyNote('Morning run 5k', ['quadrant:lifeforce', 'exercise'])
    createDailyNote('Evening yoga', ['quadrant:lifeforce', 'exercise'])
    createDailyNote('Shipped feature X', ['quadrant:industry', 'engineering'])

    const log = runConsolidation(db)

    expect(log.success).toBe(true)
    expect(log.details.notes_processed).toBe(3)
    expect(log.details.items_consolidated).toBe(2) // 2 groups: lifeforce+exercise, industry+engineering
  })

  it('creates consolidated items in life_directory layer with semantic type', () => {
    createDailyNote('Note A', ['quadrant:fellowship', 'friends'])
    createDailyNote('Note B', ['quadrant:fellowship', 'friends'])

    runConsolidation(db)

    // Find the consolidated item
    const rows = db
      .prepare("SELECT * FROM memory_items WHERE layer = 'life_directory'")
      .all() as Array<Record<string, unknown>>

    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('semantic')
    expect(rows[0].layer).toBe('life_directory')
    expect(rows[0].source_type).toBe('consolidation')
  })

  it('sets consolidated_into on source daily notes', () => {
    const note1 = createDailyNote('Note 1', ['quadrant:essence', 'reflection'])
    const note2 = createDailyNote('Note 2', ['quadrant:essence', 'reflection'])

    runConsolidation(db)

    // Check source items have consolidated_into set
    const row1 = db
      .prepare('SELECT consolidated_into FROM memory_items WHERE memory_id = ?')
      .get(note1.memory_id) as { consolidated_into: string | null }
    const row2 = db
      .prepare('SELECT consolidated_into FROM memory_items WHERE memory_id = ?')
      .get(note2.memory_id) as { consolidated_into: string | null }

    expect(row1.consolidated_into).not.toBeNull()
    expect(row2.consolidated_into).not.toBeNull()
    expect(row1.consolidated_into).toBe(row2.consolidated_into)

    // The consolidated_into should reference a valid life_directory item
    const consolidated = db
      .prepare('SELECT * FROM memory_items WHERE memory_id = ?')
      .get(row1.consolidated_into!) as Record<string, unknown>
    expect(consolidated).toBeDefined()
    expect(consolidated.layer).toBe('life_directory')
  })

  it('does not re-consolidate already consolidated items', () => {
    createDailyNote('Already done', ['quadrant:lifeforce', 'sleep'])

    // First run
    runConsolidation(db)

    // Second run should find no new items
    const log2 = runConsolidation(db)
    expect(log2.details.notes_processed).toBe(0)
    expect(log2.details.items_consolidated).toBe(0)
  })

  it('respects lastRunTimestamp filter', () => {
    const pastTime = new Date(Date.now() - 86_400_000).toISOString() // 1 day ago

    // Insert an old note directly
    db.prepare(
      `INSERT INTO memory_items
       (memory_id, text, type, layer, source_type, source_id, agent_id,
        created_at, last_accessed, confidence, importance, tags,
        embedding_ref, consolidated_into, archived)
       VALUES ('old-note', 'Old note', 'episodic', 'daily_notes', 'user_input', 'test', NULL,
               ?, ?, 0.8, 0.6, '["quadrant:industry","work"]', NULL, NULL, 0)`,
    ).run(pastTime, pastTime)

    // Create a recent note
    createDailyNote('Recent note', ['quadrant:industry', 'work'])

    // Run with lastRunTimestamp = now minus 1 hour
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const log = runConsolidation(db, oneHourAgo)

    // Should only process the recent note, not the old one
    expect(log.details.notes_processed).toBe(1)
  })

  it('groups by quadrant first, then by shared tags', () => {
    createDailyNote('LF exercise', ['quadrant:lifeforce', 'exercise'])
    createDailyNote('LF sleep', ['quadrant:lifeforce', 'sleep'])
    createDailyNote('IND exercise', ['quadrant:industry', 'exercise'])

    const log = runConsolidation(db)

    // 3 groups: lifeforce+exercise, lifeforce+sleep, industry+exercise
    expect(log.details.items_consolidated).toBe(3)
    expect(log.details.notes_processed).toBe(3)
  })

  it('preserves quadrant tag on consolidated items', () => {
    createDailyNote('Note', ['quadrant:fellowship', 'community'])

    runConsolidation(db)

    const rows = db
      .prepare("SELECT tags FROM memory_items WHERE layer = 'life_directory'")
      .all() as Array<{ tags: string }>

    expect(rows).toHaveLength(1)
    const tags = JSON.parse(rows[0].tags) as string[]
    expect(tags).toContain('quadrant:fellowship')
    expect(tags).toContain('community')
  })

  it('handles notes without quadrant tags', () => {
    createDailyNote('Untagged note 1', ['general'])
    createDailyNote('Untagged note 2', ['general'])

    const log = runConsolidation(db)

    expect(log.success).toBe(true)
    expect(log.details.notes_processed).toBe(2)
    expect(log.details.items_consolidated).toBe(1)
  })

  it('skips archived daily notes', () => {
    const note = createDailyNote('Archived note', ['quadrant:essence', 'meditation'])
    db.prepare('UPDATE memory_items SET archived = 1 WHERE memory_id = ?').run(note.memory_id)

    const log = runConsolidation(db)

    expect(log.details.notes_processed).toBe(0)
  })

  it('summary text includes source note texts', () => {
    createDailyNote('Ran 5 miles', ['quadrant:lifeforce', 'running'])
    createDailyNote('Stretched after run', ['quadrant:lifeforce', 'running'])

    runConsolidation(db)

    const row = db
      .prepare("SELECT text FROM memory_items WHERE layer = 'life_directory'")
      .get() as { text: string }

    expect(row.text).toContain('Ran 5 miles')
    expect(row.text).toContain('Stretched after run')
    expect(row.text).toContain('Consolidated from 2 daily notes')
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavious-memory-architecture, Property 8: Consolidation Integrity
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 10.4**
// ---------------------------------------------------------------------------

import * as fc from 'fast-check'

const quadrantIds = ['lifeforce', 'industry', 'fellowship', 'essence'] as const
const extraTags = ['exercise', 'sleep', 'work', 'friends', 'meditation', 'coding', 'reading']

/** Arbitrary for a single daily note's configuration. */
const dailyNoteArb = fc.record({
  text: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  quadrant: fc.option(fc.constantFrom(...quadrantIds), { nil: undefined }),
  extraTags: fc.subarray(extraTags, { minLength: 0, maxLength: 3 }),
  confidence: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
  importance: fc.double({ min: 0.1, max: 1.0, noNaN: true }),
})

describe('Property 8: Consolidation Integrity', () => {
  // For any set of Daily_Notes MemoryItems, after the Consolidation_Job runs:
  // (a) every processed Daily_Notes item SHALL have its consolidated_into field set to a valid Life_Directory memory_id,
  // (b) every newly created consolidated item SHALL be in the life_directory layer,
  // (c) items SHALL be grouped by quadrant tag (no consolidated item mixes quadrants).

  it(
    'all processed daily notes have consolidated_into set to a valid life_directory item, ' +
      'consolidated items are in life_directory layer, and no consolidated item mixes quadrants',
    () => {
      fc.assert(
        fc.property(
          fc.array(dailyNoteArb, { minLength: 1, maxLength: 20 }),
          (notes) => {
            // Fresh DB per iteration
            const iterDb = getDatabase(':memory:')
            const iterSvc = new MemoryService(iterDb)

            try {
              // Insert daily notes
              const createdIds: string[] = []
              for (const note of notes) {
                const tags: string[] = [...note.extraTags]
                if (note.quadrant) {
                  tags.push(`quadrant:${note.quadrant}`)
                }
                const item = iterSvc.create({
                  text: note.text,
                  type: 'episodic',
                  layer: 'daily_notes',
                  provenance: { source_type: 'user_input', source_id: 'pbt', agent_id: null },
                  tags,
                  confidence: note.confidence,
                  importance: note.importance,
                })
                createdIds.push(item.memory_id)
              }

              // Run consolidation
              const log = runConsolidation(iterDb)

              // The job should succeed
              if (!log.success) return false

              // (a) Every processed daily_notes item has consolidated_into set to a valid life_directory memory_id
              for (const id of createdIds) {
                const row = iterDb
                  .prepare('SELECT consolidated_into FROM memory_items WHERE memory_id = ?')
                  .get(id) as { consolidated_into: string | null } | undefined

                if (!row) return false // item should still exist
                if (!row.consolidated_into) return false // must be set

                // The consolidated_into must reference a valid life_directory item
                const target = iterDb
                  .prepare('SELECT layer FROM memory_items WHERE memory_id = ?')
                  .get(row.consolidated_into) as { layer: string } | undefined

                if (!target) return false
                // (b) consolidated item is in life_directory layer
                if (target.layer !== 'life_directory') return false
              }

              // (c) No consolidated item mixes quadrants
              const consolidatedRows = iterDb
                .prepare("SELECT tags FROM memory_items WHERE layer = 'life_directory' AND source_type = 'consolidation'")
                .all() as Array<{ tags: string }>

              for (const row of consolidatedRows) {
                const tags = JSON.parse(row.tags) as string[]
                const quadrants = tags.filter((t: string) => t.startsWith('quadrant:'))
                // A consolidated item should have at most one quadrant tag
                if (quadrants.length > 1) return false
              }

              return true
            } finally {
              closeDatabase(iterDb)
            }
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
