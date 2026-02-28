import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SyncLayer,
  mapMutationToMemoryItem,
  mapDashboardQuadrant,
  resolveConflict,
  computeBackoffDelay,
  type MutationType,
} from './sync-layer'
import type { MemoryItem } from './models'
import type {
  WellnessCheckIn,
  Task,
  JournalEntry,
  Goal,
  WeeklyReview,
  Connection,
  ActivityLog,
  GratitudeEntry,
} from '@/types'

// --- mapDashboardQuadrant ---

describe('mapDashboardQuadrant', () => {
  it('maps health → lifeforce', () => {
    expect(mapDashboardQuadrant('health')).toBe('lifeforce')
  })
  it('maps career → industry', () => {
    expect(mapDashboardQuadrant('career')).toBe('industry')
  })
  it('maps relationships → fellowship', () => {
    expect(mapDashboardQuadrant('relationships')).toBe('fellowship')
  })
  it('maps soul → essence', () => {
    expect(mapDashboardQuadrant('soul')).toBe('essence')
  })
})

// --- mapMutationToMemoryItem ---

describe('mapMutationToMemoryItem', () => {
  it('maps addCheckIn to episodic/daily_notes with quadrant:lifeforce', () => {
    const checkIn: WellnessCheckIn = {
      id: 'ci-1', timestamp: '2025-01-01T00:00:00Z', mood: 4, energy: 3, stress: 2,
    }
    const result = mapMutationToMemoryItem('addCheckIn', checkIn as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.layer).toBe('daily_notes')
    expect(result!.tags).toContain('quadrant:lifeforce')
    expect(result!.text).toContain('mood=4')
    expect(result!.provenance.source_type).toBe('dashboard_sync')
  })

  it('maps createTask to episodic/daily_notes with quadrant:industry', () => {
    const task: Task = {
      id: 't-1', title: 'Ship feature', priority: 'high', completed: false, createdAt: '2025-01-01T00:00:00Z',
    }
    const result = mapMutationToMemoryItem('createTask', task as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.layer).toBe('daily_notes')
    expect(result!.tags).toContain('quadrant:industry')
    expect(result!.text).toContain('Ship feature')
  })

  it('maps editTask (completion) to episodic/daily_notes with quadrant:industry', () => {
    const payload = { id: 't-1', updates: { completed: true } }
    const result = mapMutationToMemoryItem('editTask', payload as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.tags).toContain('quadrant:industry')
    expect(result!.text).toContain('completed')
  })

  it('maps addJournalEntry to episodic/daily_notes with quadrant:essence', () => {
    const entry: JournalEntry = { id: 'j-1', text: 'Reflected on the day', timestamp: '2025-01-01T00:00:00Z' }
    const result = mapMutationToMemoryItem('addJournalEntry', entry as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.layer).toBe('daily_notes')
    expect(result!.tags).toContain('quadrant:essence')
    expect(result!.text).toContain('Reflected on the day')
  })

  it('maps createGoal to semantic/life_directory with dynamic quadrant', () => {
    const goal: Goal = {
      id: 'g-1', quadrant: 'health', title: 'Run a marathon', progressPct: 0,
    }
    const result = mapMutationToMemoryItem('createGoal', goal as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('semantic')
    expect(result!.layer).toBe('life_directory')
    expect(result!.tags).toContain('quadrant:lifeforce')
  })

  it('maps createGoal with career quadrant to quadrant:industry', () => {
    const goal: Goal = {
      id: 'g-2', quadrant: 'career', title: 'Get promoted', progressPct: 50,
    }
    const result = mapMutationToMemoryItem('createGoal', goal as unknown as Record<string, unknown>)
    expect(result!.tags).toContain('quadrant:industry')
  })

  it('maps addWeeklyReview to episodic/daily_notes with no quadrant tag', () => {
    const review: WeeklyReview = {
      id: 'wr-1', timestamp: '2025-01-01T00:00:00Z',
      wentWell: 'Good progress', didNotGoWell: 'Missed gym', nextWeekFocus: 'Balance',
    }
    const result = mapMutationToMemoryItem('addWeeklyReview', review as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.layer).toBe('daily_notes')
    expect(result!.tags).toEqual([]) // no quadrant tag
  })

  it('maps addConnection to entity_profile/daily_notes with quadrant:fellowship', () => {
    const conn: Connection = {
      id: 'c-1', name: 'Alice', relationshipType: 'friend',
      lastContactDate: '2025-01-01', reminderFrequencyDays: 14,
    }
    const result = mapMutationToMemoryItem('addConnection', conn as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('entity_profile')
    expect(result!.tags).toContain('quadrant:fellowship')
  })

  it('maps logActivity to episodic/daily_notes with quadrant:fellowship', () => {
    const activity: ActivityLog = {
      id: 'a-1', connectionId: 'c-1', description: 'Had coffee', date: '2025-01-01',
    }
    const result = mapMutationToMemoryItem('logActivity', activity as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.tags).toContain('quadrant:fellowship')
  })

  it('maps addGratitudeEntry to episodic/daily_notes with quadrant:essence', () => {
    const entry: GratitudeEntry = {
      id: 'gr-1', date: '2025-01-01', items: ['sunshine', 'good coffee'],
    }
    const result = mapMutationToMemoryItem('addGratitudeEntry', entry as unknown as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('episodic')
    expect(result!.layer).toBe('daily_notes')
    expect(result!.tags).toContain('quadrant:essence')
  })

  it('sets provenance source_type to dashboard_sync', () => {
    const task: Task = {
      id: 't-1', title: 'Test', priority: 'low', completed: false, createdAt: '2025-01-01T00:00:00Z',
    }
    const result = mapMutationToMemoryItem('createTask', task as unknown as Record<string, unknown>)
    expect(result!.provenance.source_type).toBe('dashboard_sync')
    expect(result!.provenance.agent_id).toBeNull()
  })
})

// --- resolveConflict ---

describe('resolveConflict', () => {
  const makeItem = (id: string, createdAt: string): MemoryItem => ({
    memory_id: id,
    text: `Item ${id}`,
    type: 'episodic',
    layer: 'daily_notes',
    provenance: { source_type: 'dashboard_sync', source_id: id, agent_id: null },
    created_at: createdAt,
    last_accessed: createdAt,
    confidence: 0.8,
    importance: 0.5,
    tags: [],
    embedding_ref: null,
    consolidated_into: null,
    archived: false,
  })

  it('returns the item with the later timestamp', () => {
    const local = makeItem('a', '2025-01-02T00:00:00Z')
    const remote = makeItem('b', '2025-01-01T00:00:00Z')
    expect(resolveConflict(local, remote)).toBe(local)
  })

  it('returns remote when remote is later', () => {
    const local = makeItem('a', '2025-01-01T00:00:00Z')
    const remote = makeItem('b', '2025-01-02T00:00:00Z')
    expect(resolveConflict(local, remote)).toBe(remote)
  })

  it('returns remote on equal timestamps (server authoritative)', () => {
    const local = makeItem('a', '2025-01-01T00:00:00Z')
    const remote = makeItem('b', '2025-01-01T00:00:00Z')
    expect(resolveConflict(local, remote)).toBe(remote)
  })
})

// --- computeBackoffDelay ---

describe('computeBackoffDelay', () => {
  it('returns base delay for retryCount 0', () => {
    expect(computeBackoffDelay(0)).toBe(1000)
  })
  it('doubles for each retry', () => {
    expect(computeBackoffDelay(1)).toBe(2000)
    expect(computeBackoffDelay(2)).toBe(4000)
    expect(computeBackoffDelay(3)).toBe(8000)
  })
  it('caps at 30 seconds', () => {
    expect(computeBackoffDelay(10)).toBe(30_000)
    expect(computeBackoffDelay(20)).toBe(30_000)
  })
})

// --- SyncLayer class ---

describe('SyncLayer', () => {
  let syncLayer: SyncLayer

  beforeEach(() => {
    syncLayer = new SyncLayer('http://localhost:3000')
    vi.restoreAllMocks()
  })

  describe('queueMutation', () => {
    it('adds a mutation to the pending queue', () => {
      const mutation = syncLayer.queueMutation('addCheckIn', { id: 'ci-1', mood: 4, energy: 3, stress: 2 })
      expect(mutation.type).toBe('addCheckIn')
      expect(mutation.retryCount).toBe(0)
      expect(syncLayer.getPendingQueue()).toHaveLength(1)
    })

    it('assigns unique ids to each mutation', () => {
      const m1 = syncLayer.queueMutation('addCheckIn', { id: '1' })
      const m2 = syncLayer.queueMutation('createTask', { id: '2' })
      expect(m1.id).not.toBe(m2.id)
    })
  })

  describe('removeMutation', () => {
    it('removes a mutation by id', () => {
      const m = syncLayer.queueMutation('addCheckIn', { id: '1' })
      expect(syncLayer.removeMutation(m.id)).toBe(true)
      expect(syncLayer.getPendingQueue()).toHaveLength(0)
    })

    it('returns false for non-existent id', () => {
      expect(syncLayer.removeMutation('nonexistent')).toBe(false)
    })

    it('sets status to synced when queue empties', () => {
      const m = syncLayer.queueMutation('addCheckIn', { id: '1' })
      syncLayer.removeMutation(m.id)
      expect(syncLayer.getStatus()).toBe('synced')
    })
  })

  describe('processPendingQueue', () => {
    it('syncs mutations and removes them from queue on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ memory_id: 'mem-1' }), { status: 201 }),
      )

      syncLayer.queueMutation('addCheckIn', { id: 'ci-1', mood: 4, energy: 3, stress: 2 })
      const synced = await syncLayer.processPendingQueue()

      expect(synced).toHaveLength(1)
      expect(syncLayer.getPendingQueue()).toHaveLength(0)
      expect(syncLayer.getStatus()).toBe('synced')
    })

    it('keeps mutation in queue on failure and sets offline status', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      syncLayer.queueMutation('createTask', { id: 't-1', title: 'Test' })
      const synced = await syncLayer.processPendingQueue()

      expect(synced).toHaveLength(0)
      expect(syncLayer.getPendingQueue()).toHaveLength(1)
      expect(syncLayer.getStatus()).toBe('offline')
      expect(syncLayer.getPendingQueue()[0].retryCount).toBe(1)
    })

    it('sets error status after max retries', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      syncLayer.queueMutation('createTask', { id: 't-1', title: 'Test' })

      // Exhaust retries (MAX_RETRY_COUNT = 5)
      for (let i = 0; i < 5; i++) {
        await syncLayer.processPendingQueue()
      }

      expect(syncLayer.getStatus()).toBe('error')
    })

    it('processes multiple mutations in order', async () => {
      const calls: string[] = []
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        const body = JSON.parse((init as RequestInit).body as string)
        calls.push(body.text)
        return new Response(JSON.stringify({ memory_id: 'mem-1' }), { status: 201 })
      })

      syncLayer.queueMutation('addCheckIn', { id: 'ci-1', mood: 4, energy: 3, stress: 2 })
      syncLayer.queueMutation('createTask', { id: 't-1', title: 'Ship it', priority: 'high', completed: false, createdAt: '2025-01-01T00:00:00Z' })

      await syncLayer.processPendingQueue()

      expect(calls).toHaveLength(2)
      expect(calls[0]).toContain('mood=4')
      expect(calls[1]).toContain('Ship it')
    })

    it('stops processing on first failure (preserves order)', async () => {
      let callCount = 0
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        callCount++
        if (callCount === 1) throw new Error('fail')
        return new Response('{}', { status: 201 })
      })

      syncLayer.queueMutation('addCheckIn', { id: '1', mood: 3, energy: 3, stress: 3 })
      syncLayer.queueMutation('createTask', { id: '2', title: 'Second' })

      await syncLayer.processPendingQueue()

      // First failed, second never attempted
      expect(syncLayer.getPendingQueue()).toHaveLength(2)
      expect(callCount).toBe(1)
    })
  })

  describe('hydrate', () => {
    it('fetches items from the API', async () => {
      const items = [{ memory_id: 'mem-1', text: 'test' }]
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ items }), { status: 200 }),
      )

      const result = await syncLayer.hydrate()
      expect(result).toEqual(items)
      expect(syncLayer.getStatus()).toBe('synced')
    })

    it('returns empty array and sets offline on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await syncLayer.hydrate()
      expect(result).toEqual([])
      expect(syncLayer.getStatus()).toBe('offline')
    })
  })

  describe('interceptMutation', () => {
    it('queues and attempts to sync', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 201 }),
      )

      await syncLayer.interceptMutation('addJournalEntry', {
        id: 'j-1', text: 'Today was good', timestamp: '2025-01-01T00:00:00Z',
      })

      expect(syncLayer.getPendingQueue()).toHaveLength(0)
      expect(syncLayer.getStatus()).toBe('synced')
    })
  })
})


// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 11: Quadrant Tag Assignment
// **Validates: Requirements 10.1, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6**
// ---------------------------------------------------------------------------

import * as fc from 'fast-check'
import type { QuadrantId as DashboardQuadrantId } from '@/types'

// --- Arbitraries ---

const dashboardQuadrants: DashboardQuadrantId[] = ['health', 'career', 'relationships', 'soul']
const priorities = ['high', 'medium', 'low'] as const
const moodLevels = [1, 2, 3, 4, 5] as const

const isoTimestampArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString())
const idArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0)
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)

const checkInArb = fc.record({
  id: idArb,
  timestamp: isoTimestampArb,
  mood: fc.constantFrom(...moodLevels),
  energy: fc.constantFrom(...moodLevels),
  stress: fc.constantFrom(...moodLevels),
})

const taskArb = fc.record({
  id: idArb,
  title: nonEmptyStringArb,
  description: fc.option(nonEmptyStringArb, { nil: undefined }),
  priority: fc.constantFrom(...priorities),
  completed: fc.boolean(),
  createdAt: isoTimestampArb,
})

const journalArb = fc.record({
  id: idArb,
  text: nonEmptyStringArb,
  timestamp: isoTimestampArb,
})

const gratitudeArb = fc.record({
  id: idArb,
  date: isoTimestampArb,
  items: fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 3 }),
})

const goalArb = fc.record({
  id: idArb,
  quadrant: fc.constantFrom(...dashboardQuadrants),
  title: nonEmptyStringArb,
  description: fc.option(nonEmptyStringArb, { nil: undefined }),
  progressPct: fc.integer({ min: 0, max: 100 }),
})

const weeklyReviewArb = fc.record({
  id: idArb,
  timestamp: isoTimestampArb,
  wentWell: nonEmptyStringArb,
  didNotGoWell: nonEmptyStringArb,
  nextWeekFocus: nonEmptyStringArb,
})

const connectionArb = fc.record({
  id: idArb,
  name: nonEmptyStringArb,
  relationshipType: nonEmptyStringArb,
  lastContactDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
  reminderFrequencyDays: fc.integer({ min: 1, max: 365 }),
})

const activityLogArb = fc.record({
  id: idArb,
  connectionId: idArb,
  description: nonEmptyStringArb,
  date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
})

/** Expected mapping from mutation type to { type, layer, quadrantTag } */
const EXPECTED_MAPPINGS: Record<string, { type: string; layer: string; quadrantTag: string | null }> = {
  addCheckIn: { type: 'episodic', layer: 'daily_notes', quadrantTag: 'quadrant:lifeforce' },
  createTask: { type: 'episodic', layer: 'daily_notes', quadrantTag: 'quadrant:industry' },
  addJournalEntry: { type: 'episodic', layer: 'daily_notes', quadrantTag: 'quadrant:essence' },
  addGratitudeEntry: { type: 'episodic', layer: 'daily_notes', quadrantTag: 'quadrant:essence' },
  createGoal: { type: 'semantic', layer: 'life_directory', quadrantTag: null }, // dynamic
  addWeeklyReview: { type: 'episodic', layer: 'daily_notes', quadrantTag: null },
  addConnection: { type: 'entity_profile', layer: 'daily_notes', quadrantTag: 'quadrant:fellowship' },
  logActivity: { type: 'episodic', layer: 'daily_notes', quadrantTag: 'quadrant:fellowship' },
}

const DASHBOARD_TO_MEMORY: Record<string, string> = {
  health: 'lifeforce',
  career: 'industry',
  relationships: 'fellowship',
  soul: 'essence',
}

describe('Property 11: Quadrant Tag Assignment', () => {
  // For any dashboard event, the Sync_Layer SHALL produce a MemoryItem with the correct
  // type, layer, and quadrant tag as specified by the mapping rules.

  it('addCheckIn → episodic/daily_notes/quadrant:lifeforce', () => {
    fc.assert(
      fc.property(checkInArb, (checkIn) => {
        const result = mapMutationToMemoryItem('addCheckIn', checkIn as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('episodic')
        expect(result!.layer).toBe('daily_notes')
        expect(result!.tags).toContain('quadrant:lifeforce')
        expect(result!.provenance.source_type).toBe('dashboard_sync')
      }),
      { numRuns: 100 },
    )
  })

  it('createTask → episodic/daily_notes/quadrant:industry', () => {
    fc.assert(
      fc.property(taskArb, (task) => {
        const result = mapMutationToMemoryItem('createTask', task as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('episodic')
        expect(result!.layer).toBe('daily_notes')
        expect(result!.tags).toContain('quadrant:industry')
      }),
      { numRuns: 100 },
    )
  })

  it('addJournalEntry → episodic/daily_notes/quadrant:essence', () => {
    fc.assert(
      fc.property(journalArb, (entry) => {
        const result = mapMutationToMemoryItem('addJournalEntry', entry as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('episodic')
        expect(result!.layer).toBe('daily_notes')
        expect(result!.tags).toContain('quadrant:essence')
      }),
      { numRuns: 100 },
    )
  })

  it('addGratitudeEntry → episodic/daily_notes/quadrant:essence', () => {
    fc.assert(
      fc.property(gratitudeArb, (entry) => {
        const result = mapMutationToMemoryItem('addGratitudeEntry', entry as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('episodic')
        expect(result!.layer).toBe('daily_notes')
        expect(result!.tags).toContain('quadrant:essence')
      }),
      { numRuns: 100 },
    )
  })

  it('createGoal → semantic/life_directory with dynamic quadrant from goal.quadrant', () => {
    fc.assert(
      fc.property(goalArb, (goal) => {
        const result = mapMutationToMemoryItem('createGoal', goal as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('semantic')
        expect(result!.layer).toBe('life_directory')
        const expectedQuadrant = `quadrant:${DASHBOARD_TO_MEMORY[goal.quadrant]}`
        expect(result!.tags).toContain(expectedQuadrant)
      }),
      { numRuns: 100 },
    )
  })

  it('addWeeklyReview → episodic/daily_notes with no quadrant tag', () => {
    fc.assert(
      fc.property(weeklyReviewArb, (review) => {
        const result = mapMutationToMemoryItem('addWeeklyReview', review as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('episodic')
        expect(result!.layer).toBe('daily_notes')
        const quadrantTags = result!.tags.filter((t) => t.startsWith('quadrant:'))
        expect(quadrantTags).toHaveLength(0)
      }),
      { numRuns: 100 },
    )
  })

  it('addConnection → entity_profile/daily_notes/quadrant:fellowship', () => {
    fc.assert(
      fc.property(connectionArb, (conn) => {
        const result = mapMutationToMemoryItem('addConnection', conn as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('entity_profile')
        expect(result!.layer).toBe('daily_notes')
        expect(result!.tags).toContain('quadrant:fellowship')
      }),
      { numRuns: 100 },
    )
  })

  it('logActivity → episodic/daily_notes/quadrant:fellowship', () => {
    fc.assert(
      fc.property(activityLogArb, (activity) => {
        const result = mapMutationToMemoryItem('logActivity', activity as unknown as Record<string, unknown>)
        expect(result).not.toBeNull()
        expect(result!.type).toBe('episodic')
        expect(result!.layer).toBe('daily_notes')
        expect(result!.tags).toContain('quadrant:fellowship')
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 12: Sync Layer Mutation Propagation
// **Validates: Requirements 14.1, 14.4**
// ---------------------------------------------------------------------------

const allMutationTypes: MutationType[] = [
  'addCheckIn', 'createTask', 'editTask', 'deleteTask',
  'addJournalEntry', 'addGratitudeEntry', 'createGoal', 'updateGoalProgress',
  'addWeeklyReview', 'addConnection', 'logActivity', 'updateConnection',
]

/** Generate a plausible payload for any mutation type. */
function payloadForMutation(type: MutationType): Record<string, unknown> {
  switch (type) {
    case 'addCheckIn':
      return { id: 'ci-pbt', timestamp: new Date().toISOString(), mood: 3, energy: 3, stress: 3 }
    case 'createTask':
      return { id: 't-pbt', title: 'PBT task', priority: 'medium', completed: false, createdAt: new Date().toISOString() }
    case 'editTask':
      return { id: 't-pbt', updates: { completed: true } }
    case 'deleteTask':
      return { id: 't-pbt' }
    case 'addJournalEntry':
      return { id: 'j-pbt', text: 'PBT journal', timestamp: new Date().toISOString() }
    case 'addGratitudeEntry':
      return { id: 'gr-pbt', date: '2025-01-01', items: ['test'] }
    case 'createGoal':
      return { id: 'g-pbt', quadrant: 'health', title: 'PBT goal', progressPct: 0 }
    case 'updateGoalProgress':
      return { id: 'g-pbt', progressPct: 50 }
    case 'addWeeklyReview':
      return { id: 'wr-pbt', timestamp: new Date().toISOString(), wentWell: 'ok', didNotGoWell: 'ok', nextWeekFocus: 'ok' }
    case 'addConnection':
      return { id: 'c-pbt', name: 'PBT', relationshipType: 'friend', lastContactDate: '2025-01-01', reminderFrequencyDays: 7 }
    case 'logActivity':
      return { id: 'a-pbt', connectionId: 'c-pbt', description: 'PBT activity', date: '2025-01-01' }
    case 'updateConnection':
      return { id: 'c-pbt' }
  }
}

const mutationArb = fc.constantFrom(...allMutationTypes).map((type) => ({
  type,
  payload: payloadForMutation(type),
}))

describe('Property 12: Sync Layer Mutation Propagation', () => {
  // For any Zustand store mutation, the Sync_Layer SHALL produce a corresponding
  // Memory_Service API call. After successful sync, the pending mutation queue SHALL
  // not contain that mutation. After failed sync, the mutation SHALL remain in the queue.

  it('successful sync removes mutation from pending queue', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mutationArb, { minLength: 1, maxLength: 10 }),
        async (mutations) => {
          const layer = new SyncLayer('http://localhost:3000')

          // Mock fetch to always succeed
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ memory_id: 'mem-pbt' }), { status: 201 }),
          )

          try {
            // Queue all mutations
            for (const m of mutations) {
              layer.queueMutation(m.type, m.payload)
            }

            expect(layer.getPendingQueue()).toHaveLength(mutations.length)

            // Process — all should succeed
            const synced = await layer.processPendingQueue()

            // After successful sync, queue should be empty
            expect(layer.getPendingQueue()).toHaveLength(0)
            expect(synced.length).toBe(mutations.length)
            expect(layer.getStatus()).toBe('synced')
          } finally {
            fetchSpy.mockRestore()
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('failed sync keeps mutation in pending queue', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mutationArb, { minLength: 1, maxLength: 10 }),
        async (mutations) => {
          const layer = new SyncLayer('http://localhost:3000')

          // Mock fetch to always fail
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

          try {
            // Queue all mutations
            for (const m of mutations) {
              layer.queueMutation(m.type, m.payload)
            }

            const synced = await layer.processPendingQueue()

            // After failed sync, all mutations should remain in queue
            expect(synced).toHaveLength(0)
            expect(layer.getPendingQueue()).toHaveLength(mutations.length)
            // First mutation should have retryCount incremented
            expect(layer.getPendingQueue()[0].retryCount).toBe(1)
          } finally {
            fetchSpy.mockRestore()
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('partial success removes only synced mutations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(mutationArb, { minLength: 2, maxLength: 10 }),
        fc.integer({ min: 1, max: 9 }),
        async (mutations, failAfter) => {
          const effectiveFailAfter = Math.min(failAfter, mutations.length - 1)
          const layer = new SyncLayer('http://localhost:3000')

          let callCount = 0
          const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
            callCount++
            if (callCount > effectiveFailAfter) throw new Error('fail')
            return new Response(JSON.stringify({ memory_id: 'mem-pbt' }), { status: 201 })
          })

          try {
            for (const m of mutations) {
              layer.queueMutation(m.type, m.payload)
            }

            const synced = await layer.processPendingQueue()

            // Exactly effectiveFailAfter mutations should have been synced
            expect(synced).toHaveLength(effectiveFailAfter)
            // Remaining mutations stay in queue
            expect(layer.getPendingQueue()).toHaveLength(mutations.length - effectiveFailAfter)
          } finally {
            fetchSpy.mockRestore()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 13: Last-Write-Wins Conflict Resolution
// **Validates: Requirements 14.6**
// ---------------------------------------------------------------------------

const memoryItemArb = fc.record({
  memory_id: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
  text: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
  type: fc.constantFrom('episodic' as const, 'semantic' as const, 'procedural' as const, 'entity_profile' as const),
  layer: fc.constantFrom('life_directory' as const, 'daily_notes' as const, 'tacit_knowledge' as const),
  provenance: fc.record({
    source_type: fc.constantFrom('user_input' as const, 'agent_output' as const, 'dashboard_sync' as const),
    source_id: fc.string({ minLength: 1, maxLength: 20 }),
    agent_id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  }),
  created_at: isoTimestampArb,
  last_accessed: isoTimestampArb,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  importance: fc.double({ min: 0, max: 1, noNaN: true }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  embedding_ref: fc.constant(null as string | null),
  consolidated_into: fc.constant(null as string | null),
  archived: fc.boolean(),
})

describe('Property 13: Last-Write-Wins Conflict Resolution', () => {
  // For any two conflicting state updates with different timestamps,
  // the Sync_Layer SHALL resolve the conflict by keeping the update
  // with the later timestamp.

  it('always keeps the item with the later created_at timestamp', () => {
    fc.assert(
      fc.property(memoryItemArb, memoryItemArb, (itemA, itemB) => {
        const result = resolveConflict(itemA, itemB)

        const timeA = new Date(itemA.created_at).getTime()
        const timeB = new Date(itemB.created_at).getTime()

        if (timeA > timeB) {
          // Local (itemA) is later → should win
          expect(result).toBe(itemA)
        } else {
          // Remote (itemB) is later or equal → remote wins (server authoritative on ties)
          expect(result).toBe(itemB)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('equal timestamps resolve to remote (server authoritative)', () => {
    fc.assert(
      fc.property(memoryItemArb, (item) => {
        // Create two items with the same timestamp
        const local = { ...item, memory_id: 'local' }
        const remote = { ...item, memory_id: 'remote' }
        // Same created_at → remote wins
        const result = resolveConflict(local, remote)
        expect(result).toBe(remote)
      }),
      { numRuns: 100 },
    )
  })

  it('result is always one of the two input items (no mutation)', () => {
    fc.assert(
      fc.property(memoryItemArb, memoryItemArb, (itemA, itemB) => {
        const result = resolveConflict(itemA, itemB)
        // Must be referentially one of the two inputs
        expect(result === itemA || result === itemB).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})
