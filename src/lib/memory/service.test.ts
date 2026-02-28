import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { MemoryService } from './service'
import type { CreateMemoryItemInput } from './models'
import { MemoryValidationError } from './validation'

function makeInput(overrides: Partial<CreateMemoryItemInput> = {}): CreateMemoryItemInput {
  return {
    text: 'Test memory item',
    type: 'episodic',
    layer: 'daily_notes',
    provenance: {
      source_type: 'user_input',
      source_id: 'test-source',
      agent_id: null,
    },
    ...overrides,
  }
}

describe('MemoryService', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('create', () => {
    it('returns item with all required fields', () => {
      const item = service.create(makeInput())

      expect(item.memory_id).toBeDefined()
      expect(item.memory_id.length).toBeGreaterThan(0)
      expect(item.text).toBe('Test memory item')
      expect(item.type).toBe('episodic')
      expect(item.layer).toBe('daily_notes')
      expect(item.provenance.source_type).toBe('user_input')
      expect(item.provenance.source_id).toBe('test-source')
      expect(item.provenance.agent_id).toBeNull()
      expect(item.created_at).toBeDefined()
      expect(item.last_accessed).toBe(item.created_at)
      expect(item.confidence).toBe(0.5)
      expect(item.importance).toBe(0.5)
      expect(item.tags).toEqual([])
      expect(item.embedding_ref).toBeNull()
      expect(item.consolidated_into).toBeNull()
      expect(item.archived).toBe(false)
    })

    it('generates unique IDs for each item', () => {
      const item1 = service.create(makeInput())
      const item2 = service.create(makeInput())
      expect(item1.memory_id).not.toBe(item2.memory_id)
    })

    it('uses provided confidence and importance', () => {
      const item = service.create(makeInput({ confidence: 0.9, importance: 0.1 }))
      expect(item.confidence).toBe(0.9)
      expect(item.importance).toBe(0.1)
    })

    it('defaults confidence to 0.5 when not provided', () => {
      const item = service.create(makeInput())
      expect(item.confidence).toBe(0.5)
    })

    it('defaults importance to 0.5 when not provided', () => {
      const item = service.create(makeInput())
      expect(item.importance).toBe(0.5)
    })

    it('defaults tags to empty array when not provided', () => {
      const item = service.create(makeInput())
      expect(item.tags).toEqual([])
    })

    it('preserves provided tags', () => {
      const item = service.create(makeInput({ tags: ['tag1', 'tag2'] }))
      expect(item.tags).toEqual(['tag1', 'tag2'])
    })

    it('rejects confidence outside 0.0–1.0', () => {
      expect(() => service.create(makeInput({ confidence: 1.5 }))).toThrow(MemoryValidationError)
      expect(() => service.create(makeInput({ confidence: -0.1 }))).toThrow(MemoryValidationError)
    })

    it('rejects importance outside 0.0–1.0', () => {
      expect(() => service.create(makeInput({ importance: 2.0 }))).toThrow(MemoryValidationError)
      expect(() => service.create(makeInput({ importance: -1 }))).toThrow(MemoryValidationError)
    })

    it('sets created_at and last_accessed to ISO 8601 timestamps', () => {
      const before = new Date().toISOString()
      const item = service.create(makeInput())
      const after = new Date().toISOString()

      expect(item.created_at >= before).toBe(true)
      expect(item.created_at <= after).toBe(true)
      expect(item.last_accessed).toBe(item.created_at)
    })

    it('persists item to SQLite', () => {
      const item = service.create(makeInput())
      const row = db
        .prepare('SELECT * FROM memory_items WHERE memory_id = ?')
        .get(item.memory_id) as Record<string, unknown>
      expect(row).toBeDefined()
      expect(row.text).toBe('Test memory item')
    })
  })

  describe('getById', () => {
    it('returns the item and updates last_accessed', () => {
      const created = service.create(makeInput())
      // Small delay to ensure timestamp difference
      const retrieved = service.getById(created.memory_id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.memory_id).toBe(created.memory_id)
      expect(retrieved!.text).toBe(created.text)
      expect(retrieved!.last_accessed >= created.last_accessed).toBe(true)
    })

    it('returns null for non-existent ID', () => {
      const result = service.getById('nonexistent-id')
      expect(result).toBeNull()
    })

    it('parses tags from JSON string to array', () => {
      const created = service.create(makeInput({ tags: ['alpha', 'beta'] }))
      const retrieved = service.getById(created.memory_id)
      expect(retrieved!.tags).toEqual(['alpha', 'beta'])
    })

    it('parses provenance fields into Provenance object', () => {
      const created = service.create(
        makeInput({
          provenance: {
            source_type: 'agent_output',
            source_id: 'agent-123',
            agent_id: 'agent-lifeforce',
          },
        }),
      )
      const retrieved = service.getById(created.memory_id)
      expect(retrieved!.provenance).toEqual({
        source_type: 'agent_output',
        source_id: 'agent-123',
        agent_id: 'agent-lifeforce',
      })
    })

    it('converts archived integer to boolean', () => {
      const created = service.create(makeInput())
      const retrieved = service.getById(created.memory_id)
      expect(retrieved!.archived).toBe(false)
    })
  })

  describe('update', () => {
    it('modifies text field', () => {
      const created = service.create(makeInput())
      const updated = service.update(created.memory_id, { text: 'Updated text' })
      expect(updated.text).toBe('Updated text')
    })

    it('modifies confidence with validation', () => {
      const created = service.create(makeInput())
      const updated = service.update(created.memory_id, { confidence: 0.9 })
      expect(updated.confidence).toBe(0.9)
    })

    it('rejects invalid confidence on update', () => {
      const created = service.create(makeInput())
      expect(() => service.update(created.memory_id, { confidence: 1.5 })).toThrow(
        MemoryValidationError,
      )
    })

    it('rejects invalid importance on update', () => {
      const created = service.create(makeInput())
      expect(() => service.update(created.memory_id, { importance: -0.5 })).toThrow(
        MemoryValidationError,
      )
    })

    it('modifies tags', () => {
      const created = service.create(makeInput({ tags: ['old'] }))
      const updated = service.update(created.memory_id, { tags: ['new1', 'new2'] })
      expect(updated.tags).toEqual(['new1', 'new2'])
    })

    it('modifies provenance fields', () => {
      const created = service.create(makeInput())
      const updated = service.update(created.memory_id, {
        provenance: {
          source_type: 'consolidation',
          source_id: 'run-1',
          agent_id: 'agent-industry',
        },
      })
      expect(updated.provenance.source_type).toBe('consolidation')
      expect(updated.provenance.source_id).toBe('run-1')
      expect(updated.provenance.agent_id).toBe('agent-industry')
    })

    it('throws for non-existent item', () => {
      expect(() => service.update('nonexistent', { text: 'nope' })).toThrow(
        'Memory item not found: nonexistent',
      )
    })

    it('returns updated item via getById (updates last_accessed)', () => {
      const created = service.create(makeInput())
      const updated = service.update(created.memory_id, { text: 'Changed' })
      expect(updated.last_accessed >= created.last_accessed).toBe(true)
    })
  })

  describe('delete', () => {
    it('removes item and returns true', () => {
      const created = service.create(makeInput())
      const result = service.delete(created.memory_id)
      expect(result).toBe(true)
      expect(service.getById(created.memory_id)).toBeNull()
    })

    it('returns false for non-existent item', () => {
      const result = service.delete('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('list', () => {
    it('returns all items when no filters', () => {
      service.create(makeInput({ text: 'Item 1' }))
      service.create(makeInput({ text: 'Item 2' }))
      const result = service.list({})
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('filters by type', () => {
      service.create(makeInput({ type: 'episodic' }))
      service.create(makeInput({ type: 'semantic' }))
      const result = service.list({ type: 'episodic' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].type).toBe('episodic')
    })

    it('filters by layer', () => {
      service.create(makeInput({ layer: 'daily_notes' }))
      service.create(makeInput({ layer: 'life_directory' }))
      const result = service.list({ layer: 'daily_notes' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].layer).toBe('daily_notes')
    })

    it('filters by tags', () => {
      service.create(makeInput({ tags: ['health', 'sleep'] }))
      service.create(makeInput({ tags: ['work'] }))
      const result = service.list({ tags: ['health'] })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].tags).toContain('health')
    })

    it('filters by quadrant (tag prefix)', () => {
      service.create(makeInput({ tags: ['quadrant:lifeforce', 'sleep'] }))
      service.create(makeInput({ tags: ['quadrant:industry'] }))
      const result = service.list({ quadrant: 'lifeforce' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].tags).toContain('quadrant:lifeforce')
    })

    it('filters by source_type', () => {
      service.create(
        makeInput({ provenance: { source_type: 'user_input', source_id: 's1', agent_id: null } }),
      )
      service.create(
        makeInput({
          provenance: { source_type: 'agent_output', source_id: 's2', agent_id: 'a1' },
        }),
      )
      const result = service.list({ source_type: 'agent_output' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].provenance.source_type).toBe('agent_output')
    })

    it('filters by agent_id', () => {
      service.create(
        makeInput({
          provenance: { source_type: 'agent_output', source_id: 's1', agent_id: 'agent-1' },
        }),
      )
      service.create(
        makeInput({
          provenance: { source_type: 'agent_output', source_id: 's2', agent_id: 'agent-2' },
        }),
      )
      const result = service.list({ agent_id: 'agent-1' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].provenance.agent_id).toBe('agent-1')
    })

    it('supports limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        service.create(makeInput({ text: `Item ${i}` }))
      }
      const result = service.list({ limit: 2, offset: 1 })
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(5)
    })

    it('defaults limit to 20 and offset to 0', () => {
      for (let i = 0; i < 3; i++) {
        service.create(makeInput({ text: `Item ${i}` }))
      }
      const result = service.list({})
      expect(result.items).toHaveLength(3)
    })

    it('updates last_accessed on returned items', () => {
      const created = service.create(makeInput())
      const originalAccessed = created.last_accessed

      const result = service.list({})
      expect(result.items[0].last_accessed >= originalAccessed).toBe(true)
    })

    it('combines multiple filters', () => {
      service.create(makeInput({ type: 'episodic', layer: 'daily_notes', tags: ['health'] }))
      service.create(makeInput({ type: 'semantic', layer: 'daily_notes', tags: ['health'] }))
      service.create(makeInput({ type: 'episodic', layer: 'life_directory', tags: ['health'] }))

      const result = service.list({ type: 'episodic', layer: 'daily_notes', tags: ['health'] })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].type).toBe('episodic')
      expect(result.items[0].layer).toBe('daily_notes')
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 1: Memory Item CRUD Round-Trip
// **Validates: Requirements 1.1, 1.2, 3.3, 3.4, 3.5**
// ---------------------------------------------------------------------------

import * as fc from 'fast-check'
import type { MemoryType, MemoryLayer, SourceType, Provenance } from './models'

// --- Arbitraries ---

const memoryTypeArb: fc.Arbitrary<MemoryType> = fc.constantFrom(
  'episodic',
  'semantic',
  'procedural',
  'entity_profile',
)

const memoryLayerArb: fc.Arbitrary<MemoryLayer> = fc.constantFrom(
  'life_directory',
  'daily_notes',
  'tacit_knowledge',
)

const sourceTypeArb: fc.Arbitrary<SourceType> = fc.constantFrom(
  'user_input',
  'agent_output',
  'consolidation',
  'system_event',
  'dashboard_sync',
  'evolution',
)

const provenanceArb: fc.Arbitrary<Provenance> = fc.record({
  source_type: sourceTypeArb,
  source_id: fc.string({ minLength: 1, maxLength: 64 }),
  agent_id: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
})

const createInputArb: fc.Arbitrary<CreateMemoryItemInput> = fc.record({
  text: fc.string({ minLength: 1, maxLength: 500 }),
  type: memoryTypeArb,
  layer: memoryLayerArb,
  provenance: provenanceArb,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  importance: fc.double({ min: 0, max: 1, noNaN: true }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 32 }), { maxLength: 10 }),
  bypass_quality_gate: fc.boolean(),
})

// --- Property Test ---

describe('Property: Memory Item CRUD Round-Trip', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('create then getById returns deeply equal item (excluding server-assigned fields)', () => {
    fc.assert(
      fc.property(createInputArb, (input) => {
        const created = service.create(input)

        // Verify server-assigned fields exist
        expect(created.memory_id).toBeDefined()
        expect(created.memory_id.length).toBeGreaterThan(0)
        expect(created.created_at).toBeDefined()
        expect(created.last_accessed).toBeDefined()

        // Read back by ID
        const retrieved = service.getById(created.memory_id)
        expect(retrieved).not.toBeNull()

        // Compare user-supplied fields (excluding memory_id, timestamps which are server-assigned)
        expect(retrieved!.text).toBe(input.text)
        expect(retrieved!.type).toBe(input.type)
        expect(retrieved!.layer).toBe(input.layer)
        expect(retrieved!.provenance.source_type).toBe(input.provenance.source_type)
        expect(retrieved!.provenance.source_id).toBe(input.provenance.source_id)
        expect(retrieved!.provenance.agent_id).toBe(input.provenance.agent_id)
        expect(retrieved!.confidence).toBe(input.confidence)
        expect(retrieved!.importance).toBe(input.importance)
        expect(retrieved!.tags).toEqual(input.tags)
        expect(retrieved!.embedding_ref).toBeNull()
        expect(retrieved!.consolidated_into).toBeNull()
        expect(retrieved!.archived).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('update mutable field then getById reflects the new value', () => {
    fc.assert(
      fc.property(
        createInputArb,
        fc.string({ minLength: 1, maxLength: 500 }),
        (input, newText) => {
          const created = service.create(input)

          // Update text
          service.update(created.memory_id, { text: newText })

          // Read back
          const retrieved = service.getById(created.memory_id)
          expect(retrieved).not.toBeNull()
          expect(retrieved!.text).toBe(newText)

          // Other fields remain unchanged
          expect(retrieved!.type).toBe(input.type)
          expect(retrieved!.layer).toBe(input.layer)
          expect(retrieved!.provenance.source_type).toBe(input.provenance.source_type)
          expect(retrieved!.provenance.source_id).toBe(input.provenance.source_id)
          expect(retrieved!.provenance.agent_id).toBe(input.provenance.agent_id)
          expect(retrieved!.confidence).toBe(input.confidence)
          expect(retrieved!.importance).toBe(input.importance)
          expect(retrieved!.tags).toEqual(input.tags)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('delete then getById returns null', () => {
    fc.assert(
      fc.property(createInputArb, (input) => {
        const created = service.create(input)

        // Verify it exists
        expect(service.getById(created.memory_id)).not.toBeNull()

        // Delete
        const deleted = service.delete(created.memory_id)
        expect(deleted).toBe(true)

        // Verify gone
        expect(service.getById(created.memory_id)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 6: Last-Accessed Timestamp Update
// **Validates: Requirements 1.3, 4.8**
// ---------------------------------------------------------------------------

describe('Property: Last-Accessed Timestamp Update', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('getById updates last_accessed to >= the original value', () => {
    fc.assert(
      fc.property(createInputArb, (input) => {
        const created = service.create(input)
        const originalAccessed = created.last_accessed

        const retrieved = service.getById(created.memory_id)
        expect(retrieved).not.toBeNull()
        expect(retrieved!.last_accessed >= originalAccessed).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('list (search) updates last_accessed to >= the original value on all returned items', () => {
    fc.assert(
      fc.property(
        fc.array(createInputArb, { minLength: 1, maxLength: 5 }),
        (inputs) => {
          const createdItems = inputs.map((input) => service.create(input))
          const originalTimestamps = new Map(
            createdItems.map((item) => [item.memory_id, item.last_accessed]),
          )

          // List all items (no filters, high limit to get them all)
          const result = service.list({ limit: 1000 })

          // Only check items we created in this iteration
          for (const item of result.items) {
            const original = originalTimestamps.get(item.memory_id)
            if (original !== undefined) {
              expect(item.last_accessed >= original).toBe(true)
            }
          }

          // Verify all our created items appear in the results
          for (const created of createdItems) {
            const found = result.items.find((i) => i.memory_id === created.memory_id)
            expect(found).toBeDefined()
            expect(found!.last_accessed >= originalTimestamps.get(created.memory_id)!).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('list with type filter updates last_accessed on matched items only', () => {
    fc.assert(
      fc.property(createInputArb, (input) => {
        const created = service.create(input)
        const originalAccessed = created.last_accessed

        // Search by the item's type — should return our item
        const result = service.list({ type: created.type, limit: 100 })

        const matched = result.items.find((i) => i.memory_id === created.memory_id)
        if (matched) {
          expect(matched.last_accessed >= originalAccessed).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Unit Tests — Agent Task Memory Recording (Task 14.1)
// Requirements: 16.1, 16.2, 16.3
// ---------------------------------------------------------------------------

import type { AgentTask, EscalationEvent } from '../../types'

describe('MemoryService — Agent Task Memory Recording', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  const makeTask = (overrides: Partial<AgentTask> = {}): AgentTask => ({
    id: 'task-1',
    agentId: 'agent-industry',
    description: 'Research market trends',
    complexityScore: 5,
    tier: 2,
    modelUsed: 'claude-sonnet-4-5',
    status: 'complete',
    result: 'Found 3 key trends',
    createdAt: '2025-01-01T00:00:00.000Z',
    completedAt: '2025-01-01T00:05:00.000Z',
    ...overrides,
  })

  const makeEscalation = (overrides: Partial<EscalationEvent> = {}): EscalationEvent => ({
    id: 'esc-1',
    taskId: 'task-1',
    fromTier: 1,
    toTier: 2,
    failureReason: 'Context window exceeded',
    timestamp: '2025-01-01T00:03:00.000Z',
    ...overrides,
  })

  describe('recordAgentTaskCompletion', () => {
    it('creates an episodic memory in daily_notes', () => {
      const task = makeTask()
      const item = service.recordAgentTaskCompletion(task)

      expect(item.type).toBe('episodic')
      expect(item.layer).toBe('daily_notes')
    })

    it('sets provenance source_type to agent_output', () => {
      const task = makeTask()
      const item = service.recordAgentTaskCompletion(task)

      expect(item.provenance.source_type).toBe('agent_output')
      expect(item.provenance.source_id).toBe(task.id)
      expect(item.provenance.agent_id).toBe(task.agentId)
    })

    it('includes task description and result in text', () => {
      const task = makeTask()
      const item = service.recordAgentTaskCompletion(task)

      expect(item.text).toContain(task.description)
      expect(item.text).toContain(task.result!)
      expect(item.text).toContain(task.modelUsed)
    })

    it('includes task-completed tag', () => {
      const task = makeTask()
      const item = service.recordAgentTaskCompletion(task)

      expect(item.tags).toContain('agent-task')
      expect(item.tags).toContain('task-completed')
    })

    it('persists to database and is retrievable', () => {
      const task = makeTask()
      const item = service.recordAgentTaskCompletion(task)
      const retrieved = service.getById(item.memory_id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.text).toContain(task.description)
    })

    it('handles task without result', () => {
      const task = makeTask({ result: undefined })
      const item = service.recordAgentTaskCompletion(task)

      expect(item.text).toContain(task.description)
      expect(item.text).not.toContain('Result:')
    })
  })

  describe('recordAgentTaskFailure', () => {
    it('creates an episodic memory in daily_notes', () => {
      const task = makeTask({ status: 'failed' })
      const escalation = makeEscalation()
      const item = service.recordAgentTaskFailure(task, escalation)

      expect(item.type).toBe('episodic')
      expect(item.layer).toBe('daily_notes')
    })

    it('sets provenance source_type to agent_output', () => {
      const task = makeTask({ status: 'failed' })
      const escalation = makeEscalation()
      const item = service.recordAgentTaskFailure(task, escalation)

      expect(item.provenance.source_type).toBe('agent_output')
      expect(item.provenance.source_id).toBe(task.id)
      expect(item.provenance.agent_id).toBe(task.agentId)
    })

    it('includes failure reason and escalation details in text', () => {
      const task = makeTask({ status: 'failed' })
      const escalation = makeEscalation()
      const item = service.recordAgentTaskFailure(task, escalation)

      expect(item.text).toContain(task.description)
      expect(item.text).toContain(escalation.failureReason)
      expect(item.text).toContain(`Tier ${escalation.fromTier}`)
      expect(item.text).toContain(`Tier ${escalation.toTier}`)
    })

    it('includes task-failed and escalation tags', () => {
      const task = makeTask({ status: 'failed' })
      const escalation = makeEscalation()
      const item = service.recordAgentTaskFailure(task, escalation)

      expect(item.tags).toContain('agent-task')
      expect(item.tags).toContain('task-failed')
      expect(item.tags).toContain('escalation')
    })

    it('is queryable by agent_id', () => {
      const task = makeTask({ status: 'failed' })
      const escalation = makeEscalation()
      service.recordAgentTaskFailure(task, escalation)

      const result = service.list({ agent_id: task.agentId })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].provenance.agent_id).toBe(task.agentId)
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 14: Agent Task Memory Recording
// **Validates: Requirements 16.1, 16.2, 16.3**
// ---------------------------------------------------------------------------

import type { ModelTier, AgentTaskStatus } from '../../types'

const modelTierArb: fc.Arbitrary<ModelTier> = fc.constantFrom(1 as ModelTier, 2 as ModelTier, 3 as ModelTier)
const agentTaskStatusArb: fc.Arbitrary<AgentTaskStatus> = fc.constantFrom(
  'pending' as AgentTaskStatus,
  'running' as AgentTaskStatus,
  'complete' as AgentTaskStatus,
  'failed' as AgentTaskStatus,
  'cancelled' as AgentTaskStatus,
)

const agentTaskArb: fc.Arbitrary<AgentTask> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 64 }),
  agentId: fc.string({ minLength: 1, maxLength: 64 }),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  complexityScore: fc.integer({ min: 1, max: 10 }),
  tier: modelTierArb,
  modelUsed: fc.string({ minLength: 1, maxLength: 64 }),
  status: agentTaskStatusArb,
  result: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
  completedAt: fc.option(fc.constant('2025-01-01T00:05:00.000Z'), { nil: undefined }),
})

const escalationEventArb: fc.Arbitrary<EscalationEvent> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 64 }),
  taskId: fc.string({ minLength: 1, maxLength: 64 }),
  fromTier: modelTierArb,
  toTier: modelTierArb,
  failureReason: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.constant('2025-01-01T00:03:00.000Z'),
})

describe('Property: Agent Task Memory Recording', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('recordAgentTaskCompletion creates episodic memory with correct provenance for any AgentTask', () => {
    fc.assert(
      fc.property(agentTaskArb, (task) => {
        const item = service.recordAgentTaskCompletion(task)

        // Must be episodic in daily_notes
        expect(item.type).toBe('episodic')
        expect(item.layer).toBe('daily_notes')

        // Provenance must match agent_output with task's agent
        expect(item.provenance.source_type).toBe('agent_output')
        expect(item.provenance.source_id).toBe(task.id)
        expect(item.provenance.agent_id).toBe(task.agentId)

        // Text must contain the task description
        expect(item.text).toContain(task.description)

        // Must be persisted and retrievable
        const retrieved = service.getById(item.memory_id)
        expect(retrieved).not.toBeNull()
        expect(retrieved!.provenance.agent_id).toBe(task.agentId)
      }),
      { numRuns: 100 },
    )
  })

  it('recordAgentTaskFailure creates episodic memory with failure details for any AgentTask + EscalationEvent', () => {
    fc.assert(
      fc.property(agentTaskArb, escalationEventArb, (task, escalation) => {
        const item = service.recordAgentTaskFailure(task, escalation)

        // Must be episodic in daily_notes
        expect(item.type).toBe('episodic')
        expect(item.layer).toBe('daily_notes')

        // Provenance must match agent_output with task's agent
        expect(item.provenance.source_type).toBe('agent_output')
        expect(item.provenance.source_id).toBe(task.id)
        expect(item.provenance.agent_id).toBe(task.agentId)

        // Text must contain task description and failure reason
        expect(item.text).toContain(task.description)
        expect(item.text).toContain(escalation.failureReason)

        // Must be persisted and retrievable
        const retrieved = service.getById(item.memory_id)
        expect(retrieved).not.toBeNull()
        expect(retrieved!.provenance.agent_id).toBe(task.agentId)
      }),
      { numRuns: 100 },
    )
  })

  it('agent task memories are queryable by agent_id through provenance fields', () => {
    fc.assert(
      fc.property(agentTaskArb, (task) => {
        service.recordAgentTaskCompletion(task)

        const result = service.list({ agent_id: task.agentId, source_type: 'agent_output' })
        expect(result.items.length).toBeGreaterThanOrEqual(1)

        const found = result.items.find((i) => i.provenance.source_id === task.id)
        expect(found).toBeDefined()
        expect(found!.provenance.agent_id).toBe(task.agentId)
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Unit Tests — Configuration Management (Task 17.1)
// Requirements: 22.2, 22.3, 22.4
// ---------------------------------------------------------------------------

describe('MemoryService — Configuration Management', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('getConfig', () => {
    it('returns defaults when no config is stored', () => {
      const config = service.getConfig()

      expect(config.consolidation_schedule).toBe('0 2 * * *')
      expect(config.decay_schedule).toBe('0 3 * * *')
      expect(config.evolution_schedule).toBe('0 4 * * *')
      expect(config.decay_archive_threshold).toBe(0.2)
      expect(config.decay_deletion_threshold).toBe(0.05)
      expect(config.novelty_similarity_threshold).toBe(0.9)
      expect(config.quality_gate_min_confidence).toBe(0.3)
      expect(config.embedding_enabled).toBe(false)
      expect(config.embedding_endpoint).toBe('http://localhost:11434')
      expect(config.embedding_model).toBe('nomic-embed-text')
      expect(config.context_retrieval_top_n).toBe(10)
    })

    it('generates api_secret_token on first call', () => {
      const config = service.getConfig()
      expect(config.api_secret_token).toBeDefined()
      expect(config.api_secret_token.length).toBeGreaterThan(0)
    })

    it('returns same api_secret_token on subsequent calls', () => {
      const config1 = service.getConfig()
      const config2 = service.getConfig()
      expect(config1.api_secret_token).toBe(config2.api_secret_token)
    })

    it('persists api_secret_token to database', () => {
      const config = service.getConfig()
      const row = db.prepare("SELECT value FROM config WHERE key = 'api_secret_token'").get() as { value: string } | undefined
      expect(row).toBeDefined()
      expect(row!.value).toBe(config.api_secret_token)
    })
  })

  describe('updateConfig', () => {
    it('updates a single config value', () => {
      service.updateConfig({ decay_archive_threshold: 0.3 })
      const config = service.getConfig()
      expect(config.decay_archive_threshold).toBe(0.3)
    })

    it('updates multiple config values', () => {
      service.updateConfig({
        decay_archive_threshold: 0.3,
        decay_deletion_threshold: 0.1,
        embedding_enabled: true,
      })
      const config = service.getConfig()
      expect(config.decay_archive_threshold).toBe(0.3)
      expect(config.decay_deletion_threshold).toBe(0.1)
      expect(config.embedding_enabled).toBe(true)
    })

    it('returns the full updated config', () => {
      const config = service.updateConfig({ quality_gate_min_confidence: 0.5 })
      expect(config.quality_gate_min_confidence).toBe(0.5)
      // Other defaults still present
      expect(config.consolidation_schedule).toBe('0 2 * * *')
    })

    it('persists values across service instances', () => {
      service.updateConfig({ context_retrieval_top_n: 25 })

      // Create a new service instance on the same db
      const service2 = new MemoryService(db)
      const config = service2.getConfig()
      expect(config.context_retrieval_top_n).toBe(25)
    })

    it('overwrites previously set values', () => {
      service.updateConfig({ decay_archive_threshold: 0.3 })
      service.updateConfig({ decay_archive_threshold: 0.4 })
      const config = service.getConfig()
      expect(config.decay_archive_threshold).toBe(0.4)
    })

    it('handles string config values', () => {
      service.updateConfig({ consolidation_schedule: '0 1 * * *' })
      const config = service.getConfig()
      expect(config.consolidation_schedule).toBe('0 1 * * *')
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 19: Configuration Round-Trip
// **Validates: Requirements 22.2, 22.3, 22.4**
// ---------------------------------------------------------------------------

import type { MemoryConfig } from './models'

// Arbitrary for individual config key-value pairs
const configKeyValueArb = fc.oneof(
  fc.record({ consolidation_schedule: fc.string({ minLength: 1, maxLength: 30 }) }),
  fc.record({ decay_schedule: fc.string({ minLength: 1, maxLength: 30 }) }),
  fc.record({ evolution_schedule: fc.string({ minLength: 1, maxLength: 30 }) }),
  fc.record({ decay_archive_threshold: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ decay_deletion_threshold: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ novelty_similarity_threshold: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ quality_gate_min_confidence: fc.double({ min: 0, max: 1, noNaN: true }) }),
  fc.record({ embedding_enabled: fc.boolean() }),
  fc.record({ embedding_endpoint: fc.string({ minLength: 1, maxLength: 100 }) }),
  fc.record({ embedding_model: fc.string({ minLength: 1, maxLength: 64 }) }),
  fc.record({ context_retrieval_top_n: fc.integer({ min: 1, max: 100 }) }),
) as fc.Arbitrary<Partial<MemoryConfig>>

describe('Property: Configuration Round-Trip', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('for any config key-value, write then read returns the same value', () => {
    fc.assert(
      fc.property(configKeyValueArb, (updates) => {
        service.updateConfig(updates)
        const config = service.getConfig()

        for (const [key, value] of Object.entries(updates)) {
          const actual = config[key as keyof MemoryConfig]
          if (typeof value === 'number') {
            // Compare numbers with tolerance for floating point
            expect(Math.abs((actual as number) - value)).toBeLessThan(1e-10)
          } else {
            expect(actual).toBe(value)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('when no config exists, returns documented defaults', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Fresh DB each time via beforeEach
        const config = service.getConfig()

        expect(config.consolidation_schedule).toBe('0 2 * * *')
        expect(config.decay_schedule).toBe('0 3 * * *')
        expect(config.evolution_schedule).toBe('0 4 * * *')
        expect(config.decay_archive_threshold).toBe(0.2)
        expect(config.decay_deletion_threshold).toBe(0.05)
        expect(config.novelty_similarity_threshold).toBe(0.9)
        expect(config.quality_gate_min_confidence).toBe(0.3)
        expect(config.embedding_enabled).toBe(false)
        expect(config.embedding_endpoint).toBe('http://localhost:11434')
        expect(config.embedding_model).toBe('nomic-embed-text')
        expect(config.context_retrieval_top_n).toBe(10)
        // api_secret_token is generated, just verify it exists
        expect(config.api_secret_token.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Unit Tests — Workflow Definitions (Task 18.1)
// Requirements: 20.1
// ---------------------------------------------------------------------------

import type { WorkflowDefinition } from './models'

describe('MemoryService — Workflow Definitions', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  const makeWorkflow = (overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({
    name: 'test-workflow',
    description: 'A test workflow',
    steps: [
      {
        agent_id: 'agent-industry',
        task_template: 'Research {topic}',
        dependencies: [],
        optional: false,
      },
      {
        agent_id: 'specialist-writing',
        task_template: 'Write summary of {topic}',
        dependencies: ['step-1'],
        optional: true,
      },
    ],
    ...overrides,
  })

  describe('createWorkflow', () => {
    it('stores a workflow definition', () => {
      const def = makeWorkflow()
      service.createWorkflow(def)

      const retrieved = service.getWorkflow(def.name)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.name).toBe(def.name)
    })

    it('stores steps as JSON and parses them back', () => {
      const def = makeWorkflow()
      service.createWorkflow(def)

      const retrieved = service.getWorkflow(def.name)
      expect(retrieved!.steps).toEqual(def.steps)
    })

    it('stores trigger_conditions when provided', () => {
      const def = makeWorkflow({ trigger_conditions: 'on_schedule:daily' })
      service.createWorkflow(def)

      const retrieved = service.getWorkflow(def.name)
      expect(retrieved!.trigger_conditions).toBe('on_schedule:daily')
    })

    it('omits trigger_conditions when not provided', () => {
      const def = makeWorkflow()
      delete (def as Partial<WorkflowDefinition>).trigger_conditions
      service.createWorkflow(def)

      const retrieved = service.getWorkflow(def.name)
      expect(retrieved!.trigger_conditions).toBeUndefined()
    })

    it('overwrites existing workflow with same name', () => {
      service.createWorkflow(makeWorkflow({ description: 'Version 1' }))
      service.createWorkflow(makeWorkflow({ description: 'Version 2' }))

      const retrieved = service.getWorkflow('test-workflow')
      expect(retrieved!.description).toBe('Version 2')
    })
  })

  describe('getWorkflow', () => {
    it('returns null for non-existent workflow', () => {
      const result = service.getWorkflow('nonexistent')
      expect(result).toBeNull()
    })

    it('returns the full workflow definition', () => {
      const def = makeWorkflow()
      service.createWorkflow(def)

      const retrieved = service.getWorkflow(def.name)
      expect(retrieved!.name).toBe(def.name)
      expect(retrieved!.description).toBe(def.description)
      expect(retrieved!.steps).toEqual(def.steps)
    })
  })

  describe('listWorkflows', () => {
    it('returns empty array when no workflows exist', () => {
      const result = service.listWorkflows()
      expect(result).toEqual([])
    })

    it('returns all stored workflows', () => {
      service.createWorkflow(makeWorkflow({ name: 'wf-1', description: 'First' }))
      service.createWorkflow(makeWorkflow({ name: 'wf-2', description: 'Second' }))

      const result = service.listWorkflows()
      expect(result).toHaveLength(2)
      expect(result.map((w) => w.name).sort()).toEqual(['wf-1', 'wf-2'])
    })

    it('returns workflows ordered by name', () => {
      service.createWorkflow(makeWorkflow({ name: 'beta' }))
      service.createWorkflow(makeWorkflow({ name: 'alpha' }))

      const result = service.listWorkflows()
      expect(result[0].name).toBe('alpha')
      expect(result[1].name).toBe('beta')
    })
  })

  describe('deleteWorkflow', () => {
    it('removes workflow and returns true', () => {
      service.createWorkflow(makeWorkflow())
      const result = service.deleteWorkflow('test-workflow')

      expect(result).toBe(true)
      expect(service.getWorkflow('test-workflow')).toBeNull()
    })

    it('returns false for non-existent workflow', () => {
      const result = service.deleteWorkflow('nonexistent')
      expect(result).toBe(false)
    })

    it('does not affect other workflows', () => {
      service.createWorkflow(makeWorkflow({ name: 'keep-me' }))
      service.createWorkflow(makeWorkflow({ name: 'delete-me' }))

      service.deleteWorkflow('delete-me')

      expect(service.getWorkflow('keep-me')).not.toBeNull()
      expect(service.listWorkflows()).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 20: Workflow Definition Storage Round-Trip
// **Validates: Requirements 20.1**
// ---------------------------------------------------------------------------

import type { WorkflowStep } from './models'

const workflowStepArb: fc.Arbitrary<WorkflowStep> = fc.record({
  agent_id: fc.string({ minLength: 1, maxLength: 64 }),
  task_template: fc.string({ minLength: 1, maxLength: 200 }),
  dependencies: fc.array(fc.string({ minLength: 1, maxLength: 32 }), { maxLength: 5 }),
  optional: fc.boolean(),
})

const workflowDefinitionArb: fc.Arbitrary<WorkflowDefinition> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  steps: fc.array(workflowStepArb, { minLength: 1, maxLength: 10 }),
  trigger_conditions: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
})

describe('Property: Workflow Definition Storage Round-Trip', () => {
  let db: Database.Database
  let service: MemoryService

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('for any WorkflowDefinition, store then read returns deeply equal object', () => {
    fc.assert(
      fc.property(workflowDefinitionArb, (def) => {
        service.createWorkflow(def)
        const retrieved = service.getWorkflow(def.name)

        expect(retrieved).not.toBeNull()
        expect(retrieved!.name).toBe(def.name)
        expect(retrieved!.description).toBe(def.description)
        expect(retrieved!.steps).toEqual(def.steps)

        // trigger_conditions: undefined in input should not appear in output
        if (def.trigger_conditions !== undefined) {
          expect(retrieved!.trigger_conditions).toBe(def.trigger_conditions)
        } else {
          expect(retrieved!.trigger_conditions).toBeUndefined()
        }
      }),
      { numRuns: 100 },
    )
  })

  it('listWorkflows returns all stored workflows with correct data', () => {
    fc.assert(
      fc.property(
        fc.array(workflowDefinitionArb, { minLength: 1, maxLength: 5 })
          .map((defs) => {
            // Ensure unique names
            const seen = new Set<string>()
            return defs.filter((d) => {
              if (seen.has(d.name)) return false
              seen.add(d.name)
              return true
            })
          })
          .filter((defs) => defs.length > 0),
        (defs) => {
          // Clear workflows from previous iterations
          for (const w of service.listWorkflows()) {
            service.deleteWorkflow(w.name)
          }

          for (const def of defs) {
            service.createWorkflow(def)
          }

          const listed = service.listWorkflows()
          expect(listed.length).toBe(defs.length)

          for (const def of defs) {
            const found = listed.find((w) => w.name === def.name)
            expect(found).toBeDefined()
            expect(found!.steps).toEqual(def.steps)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('deleteWorkflow removes the workflow and getWorkflow returns null', () => {
    fc.assert(
      fc.property(workflowDefinitionArb, (def) => {
        service.createWorkflow(def)
        expect(service.getWorkflow(def.name)).not.toBeNull()

        const deleted = service.deleteWorkflow(def.name)
        expect(deleted).toBe(true)
        expect(service.getWorkflow(def.name)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
