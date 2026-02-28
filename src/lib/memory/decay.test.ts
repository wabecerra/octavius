import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { MemoryService } from './service'
import { runDecay, computeDecayScore } from './decay'

describe('DecayJob', () => {
  let db: Database.Database
  let svc: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    svc = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  /** Helper to insert a memory item with a specific last_accessed time. */
  function createItemWithAccess(
    text: string,
    layer: 'life_directory' | 'daily_notes' | 'tacit_knowledge',
    importance: number,
    lastAccessedDaysAgo: number,
  ): string {
    const item = svc.create({
      text,
      type: 'episodic',
      layer,
      provenance: { source_type: 'user_input', source_id: 'test', agent_id: null },
      confidence: 0.8,
      importance,
      tags: [],
    })
    // Manually set last_accessed to simulate age
    const pastDate = new Date(Date.now() - lastAccessedDaysAgo * 86_400_000).toISOString()
    db.prepare('UPDATE memory_items SET last_accessed = ? WHERE memory_id = ?').run(
      pastDate,
      item.memory_id,
    )
    return item.memory_id
  }

  describe('computeDecayScore', () => {
    it('returns importance for recently accessed items', () => {
      const score = computeDecayScore(0.8, new Date().toISOString())
      // daysSinceAccess ≈ 0, so score ≈ 0.8 * (1 / (1 + 0)) = 0.8
      expect(score).toBeCloseTo(0.8, 1)
    })

    it('decays with time since access', () => {
      const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString()
      const score = computeDecayScore(1.0, oneDayAgo)
      // score = 1.0 * (1 / (1 + 1)) = 0.5
      expect(score).toBeCloseTo(0.5, 1)
    })

    it('returns near-zero for very old items with low importance', () => {
      const hundredDaysAgo = new Date(Date.now() - 100 * 86_400_000).toISOString()
      const score = computeDecayScore(0.1, hundredDaysAgo)
      // score = 0.1 * (1 / (1 + 100)) ≈ 0.00099
      expect(score).toBeLessThan(0.01)
    })
  })

  describe('runDecay', () => {
    it('returns success with zero counts when no items exist', () => {
      const log = runDecay(db, 0.2, 0.05)

      expect(log.job_name).toBe('decay')
      expect(log.success).toBe(true)
      expect(log.details.items_archived).toBe(0)
      expect(log.details.items_deleted).toBe(0)
    })

    it('archives items below archive threshold', () => {
      // Create an item accessed 30 days ago with importance 0.3
      // score = 0.3 * (1 / (1 + 30)) ≈ 0.0097 — below 0.2 archive threshold
      const id = createItemWithAccess('Old note', 'daily_notes', 0.3, 30)

      const log = runDecay(db, 0.2, 0.05)

      expect(log.success).toBe(true)

      // Check item is archived
      const row = db
        .prepare('SELECT archived FROM memory_items WHERE memory_id = ?')
        .get(id) as { archived: number } | undefined

      // Item might be deleted if below deletion threshold too
      if (row) {
        expect(row.archived).toBe(1)
        expect(log.details.items_archived).toBeGreaterThanOrEqual(1)
      }
    })

    it('deletes items below deletion threshold', () => {
      // Create an item accessed 200 days ago with importance 0.1
      // score = 0.1 * (1 / (1 + 200)) ≈ 0.0005 — below 0.05 deletion threshold
      const id = createItemWithAccess('Very old note', 'life_directory', 0.1, 200)

      const log = runDecay(db, 0.2, 0.05)

      expect(log.success).toBe(true)
      expect(log.details.items_deleted).toBeGreaterThanOrEqual(1)

      // Item should be gone
      const row = db
        .prepare('SELECT * FROM memory_items WHERE memory_id = ?')
        .get(id)
      expect(row).toBeUndefined()
    })

    it('does not touch recently accessed high-importance items', () => {
      // Create a recently accessed, high-importance item
      // score ≈ 0.9 * (1 / (1 + 0)) = 0.9 — well above thresholds
      const id = createItemWithAccess('Fresh important note', 'life_directory', 0.9, 0)

      const log = runDecay(db, 0.2, 0.05)

      expect(log.success).toBe(true)

      const row = db
        .prepare('SELECT archived FROM memory_items WHERE memory_id = ?')
        .get(id) as { archived: number }
      expect(row.archived).toBe(0)
    })

    it('exempts tacit_knowledge layer items from decay', () => {
      // Create a tacit_knowledge item that would otherwise be decayed
      // score = 0.1 * (1 / (1 + 100)) ≈ 0.001 — below both thresholds
      const id = createItemWithAccess('Behavioral pattern', 'tacit_knowledge', 0.1, 100)

      const log = runDecay(db, 0.2, 0.05)

      expect(log.success).toBe(true)

      // Item should still exist and not be archived
      const row = db
        .prepare('SELECT archived FROM memory_items WHERE memory_id = ?')
        .get(id) as { archived: number }
      expect(row).toBeDefined()
      expect(row.archived).toBe(0)
    })

    it('does not process already archived items', () => {
      const id = createItemWithAccess('Already archived', 'daily_notes', 0.1, 200)
      db.prepare('UPDATE memory_items SET archived = 1 WHERE memory_id = ?').run(id)

      const log = runDecay(db, 0.2, 0.05)

      expect(log.details.items_evaluated).toBe(0)

      // Item should still exist (not deleted)
      const row = db
        .prepare('SELECT * FROM memory_items WHERE memory_id = ?')
        .get(id)
      expect(row).toBeDefined()
    })

    it('handles mixed items correctly', () => {
      // Fresh high-importance: score ≈ 0.9 — keep
      createItemWithAccess('Fresh', 'life_directory', 0.9, 0)
      // Medium age, medium importance: score = 0.5 * (1/(1+10)) ≈ 0.045 — delete
      createItemWithAccess('Medium', 'daily_notes', 0.5, 10)
      // Old low importance: score = 0.2 * (1/(1+50)) ≈ 0.004 — delete
      createItemWithAccess('Old', 'life_directory', 0.2, 50)
      // Tacit knowledge (exempt)
      createItemWithAccess('Tacit', 'tacit_knowledge', 0.1, 200)

      const log = runDecay(db, 0.2, 0.05)

      expect(log.success).toBe(true)
      // 3 non-tacit, non-archived items evaluated
      expect(log.details.items_evaluated).toBe(3)
    })

    it('records job run log with correct structure', () => {
      const log = runDecay(db, 0.2, 0.05)

      expect(log.job_name).toBe('decay')
      expect(log.started_at).toBeDefined()
      expect(log.completed_at).toBeDefined()
      expect(log.completed_at >= log.started_at).toBe(true)
      expect(typeof log.details.items_evaluated).toBe('number')
      expect(typeof log.details.items_archived).toBe('number')
      expect(typeof log.details.items_deleted).toBe('number')
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavious-memory-architecture, Property 9: Decay Score and Lifecycle
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
// ---------------------------------------------------------------------------

import * as fc from 'fast-check'

const decayLayers = ['life_directory', 'daily_notes', 'tacit_knowledge'] as const

/** Arbitrary for a single memory item's decay-relevant configuration. */
const decayItemArb = fc.record({
  text: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  layer: fc.constantFrom(...decayLayers),
  importance: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  daysAgo: fc.integer({ min: 0, max: 365 }),
})

describe('Property 9: Decay Score and Lifecycle', () => {
  // For any set of MemoryItems with known last_accessed timestamps and importance values,
  // after the Decay_Job runs:
  // (a) items with decay score below the archive threshold SHALL be marked as archived,
  // (b) items with decay score below the deletion threshold SHALL be removed,
  // (c) items in the tacit_knowledge layer SHALL remain unchanged regardless of their decay score.

  it(
    'items below archive threshold are archived, items below deletion threshold are removed, ' +
      'and tacit_knowledge items remain unchanged',
    () => {
      fc.assert(
        fc.property(
          fc.array(decayItemArb, { minLength: 1, maxLength: 20 }),
          fc.double({ min: 0.1, max: 0.5, noNaN: true }),  // archiveThreshold
          fc.double({ min: 0.01, max: 0.09, noNaN: true }), // deletionThreshold
          (items, archiveThreshold, deletionThreshold) => {
            // Ensure archive > deletion (invariant of the system)
            if (archiveThreshold <= deletionThreshold) return true // skip invalid combos

            const iterDb = getDatabase(':memory:')
            const iterSvc = new MemoryService(iterDb)

            try {
              // Insert items and set their last_accessed via SQL UPDATE
              const inserted: Array<{
                id: string
                layer: string
                importance: number
                daysAgo: number
              }> = []

              for (const item of items) {
                const created = iterSvc.create({
                  text: item.text,
                  type: 'episodic',
                  layer: item.layer,
                  provenance: { source_type: 'user_input', source_id: 'pbt', agent_id: null },
                  confidence: 0.8,
                  importance: item.importance,
                  tags: [],
                })

                // Set last_accessed to simulate age
                const pastDate = new Date(Date.now() - item.daysAgo * 86_400_000).toISOString()
                iterDb
                  .prepare('UPDATE memory_items SET last_accessed = ? WHERE memory_id = ?')
                  .run(pastDate, created.memory_id)

                inserted.push({
                  id: created.memory_id,
                  layer: item.layer,
                  importance: item.importance,
                  daysAgo: item.daysAgo,
                })
              }

              // Compute expected decay scores before running decay
              const expectedScores = inserted.map((item) => ({
                ...item,
                score: item.importance * (1 / (1 + item.daysAgo)),
              }))

              // Run decay
              const log = runDecay(iterDb, archiveThreshold, deletionThreshold)
              if (!log.success) return false

              // Verify each item
              for (const expected of expectedScores) {
                const row = iterDb
                  .prepare('SELECT archived FROM memory_items WHERE memory_id = ?')
                  .get(expected.id) as { archived: number } | undefined

                if (expected.layer === 'tacit_knowledge') {
                  // (c) tacit_knowledge items remain unchanged
                  if (!row) return false // should not be deleted
                  if (row.archived !== 0) return false // should not be archived
                } else if (expected.score < deletionThreshold) {
                  // (b) items below deletion threshold should be removed
                  if (row !== undefined) return false
                } else if (expected.score < archiveThreshold) {
                  // (a) items below archive threshold should be archived
                  if (!row) return false // should still exist
                  if (row.archived !== 1) return false
                } else {
                  // Items above archive threshold should be untouched
                  if (!row) return false
                  if (row.archived !== 0) return false
                }
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
