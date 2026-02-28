import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { MemoryService } from './service'
import { MemoryIndex } from './memory-index'
import type { CreateMemoryItemInput } from './models'

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

describe('MemoryIndex', () => {
  let db: Database.Database
  let service: MemoryService
  let index: MemoryIndex

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
    index = new MemoryIndex(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('FTS5 text search', () => {
    it('returns items matching full-text query', () => {
      service.create(makeInput({ text: 'Learning about quantum physics today' }))
      service.create(makeInput({ text: 'Grocery shopping list for the week' }))
      service.create(makeInput({ text: 'Quantum mechanics lecture notes' }))

      const result = index.search({ text: 'quantum' })
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
      for (const item of result.items) {
        expect(item.text.toLowerCase()).toContain('quantum')
      }
    })

    it('returns relevance scores for FTS5 queries', () => {
      service.create(makeInput({ text: 'quantum physics quantum mechanics quantum theory' }))
      service.create(makeInput({ text: 'quantum physics introduction' }))

      const result = index.search({ text: 'quantum' })
      expect(result.relevance_scores).toBeDefined()
      expect(result.relevance_scores).toHaveLength(result.items.length)
      for (const score of result.relevance_scores!) {
        expect(score).toBeGreaterThan(0)
      }
    })

    it('returns empty results for non-matching text', () => {
      service.create(makeInput({ text: 'Hello world' }))

      const result = index.search({ text: 'xyznonexistent' })
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('does not include relevance_scores when no text query', () => {
      service.create(makeInput())

      const result = index.search({})
      expect(result.relevance_scores).toBeUndefined()
    })
  })

  describe('filter by type', () => {
    it('returns only items of specified type', () => {
      service.create(makeInput({ type: 'episodic', text: 'Episode one' }))
      service.create(makeInput({ type: 'semantic', text: 'Fact about cats' }))
      service.create(makeInput({ type: 'procedural', text: 'How to cook' }))

      const result = index.search({ type: 'semantic' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].type).toBe('semantic')
      expect(result.total).toBe(1)
    })
  })

  describe('filter by layer', () => {
    it('returns only items in specified layer', () => {
      service.create(makeInput({ layer: 'daily_notes', text: 'Daily note' }))
      service.create(makeInput({ layer: 'life_directory', text: 'Life ref' }))
      service.create(makeInput({ layer: 'tacit_knowledge', text: 'Tacit rule' }))

      const result = index.search({ layer: 'life_directory' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].layer).toBe('life_directory')
    })
  })

  describe('filter by tags', () => {
    it('returns items matching any of the specified tags', () => {
      service.create(makeInput({ tags: ['health', 'sleep'], text: 'Sleep tracking' }))
      service.create(makeInput({ tags: ['work', 'project'], text: 'Project update' }))
      service.create(makeInput({ tags: ['health', 'exercise'], text: 'Morning run' }))

      const result = index.search({ tags: ['health'] })
      expect(result.items).toHaveLength(2)
      for (const item of result.items) {
        expect(item.tags).toContain('health')
      }
    })

    it('returns items matching any tag in the filter (OR within tags)', () => {
      service.create(makeInput({ tags: ['sleep'], text: 'Sleep data' }))
      service.create(makeInput({ tags: ['exercise'], text: 'Exercise log' }))
      service.create(makeInput({ tags: ['work'], text: 'Work notes' }))

      const result = index.search({ tags: ['sleep', 'exercise'] })
      expect(result.items).toHaveLength(2)
    })
  })

  describe('filter by quadrant', () => {
    it('returns items tagged with the specified quadrant', () => {
      service.create(makeInput({ tags: ['quadrant:lifeforce', 'sleep'], text: 'Health data' }))
      service.create(makeInput({ tags: ['quadrant:industry'], text: 'Work project' }))
      service.create(makeInput({ tags: ['quadrant:fellowship'], text: 'Friend meetup' }))

      const result = index.search({ quadrant: 'lifeforce' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].tags).toContain('quadrant:lifeforce')
    })

    it('does not match partial quadrant names', () => {
      service.create(makeInput({ tags: ['quadrant:lifeforce'], text: 'Health' }))

      const result = index.search({ quadrant: 'life' as any })
      expect(result.items).toHaveLength(0)
    })
  })

  describe('compound queries', () => {
    it('combines text search with type and layer filters', () => {
      service.create(
        makeInput({ text: 'Quantum physics lecture', type: 'episodic', layer: 'daily_notes' }),
      )
      service.create(
        makeInput({ text: 'Quantum mechanics reference', type: 'semantic', layer: 'life_directory' }),
      )
      service.create(
        makeInput({ text: 'Cooking recipe for pasta', type: 'procedural', layer: 'daily_notes' }),
      )

      const result = index.search({
        text: 'quantum',
        type: 'episodic',
        layer: 'daily_notes',
      })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].text).toContain('Quantum physics lecture')
      expect(result.items[0].type).toBe('episodic')
      expect(result.items[0].layer).toBe('daily_notes')
    })

    it('combines text search with tags filter', () => {
      service.create(makeInput({ text: 'Sleep quality analysis', tags: ['health', 'sleep'] }))
      service.create(makeInput({ text: 'Sleep deprivation study', tags: ['research'] }))

      const result = index.search({ text: 'sleep', tags: ['health'] })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].tags).toContain('health')
    })
  })

  describe('filter by provenance', () => {
    it('filters by source_type', () => {
      service.create(
        makeInput({
          text: 'User note',
          provenance: { source_type: 'user_input', source_id: 's1', agent_id: null },
        }),
      )
      service.create(
        makeInput({
          text: 'Agent output',
          provenance: { source_type: 'agent_output', source_id: 's2', agent_id: 'agent-1' },
        }),
      )

      const result = index.search({ source_type: 'agent_output' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].provenance.source_type).toBe('agent_output')
    })

    it('filters by agent_id', () => {
      service.create(
        makeInput({
          text: 'Agent 1 output',
          provenance: { source_type: 'agent_output', source_id: 's1', agent_id: 'agent-1' },
        }),
      )
      service.create(
        makeInput({
          text: 'Agent 2 output',
          provenance: { source_type: 'agent_output', source_id: 's2', agent_id: 'agent-2' },
        }),
      )

      const result = index.search({ agent_id: 'agent-1' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].provenance.agent_id).toBe('agent-1')
    })

    it('combines source_type and agent_id filters', () => {
      service.create(
        makeInput({
          text: 'Agent output 1',
          provenance: { source_type: 'agent_output', source_id: 's1', agent_id: 'agent-1' },
        }),
      )
      service.create(
        makeInput({
          text: 'User input from agent-1',
          provenance: { source_type: 'user_input', source_id: 's2', agent_id: 'agent-1' },
        }),
      )

      const result = index.search({ source_type: 'agent_output', agent_id: 'agent-1' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].provenance.source_type).toBe('agent_output')
      expect(result.items[0].provenance.agent_id).toBe('agent-1')
    })
  })

  describe('last_accessed update', () => {
    it('updates last_accessed on all returned items', () => {
      const item1 = service.create(makeInput({ text: 'Item one' }))
      const item2 = service.create(makeInput({ text: 'Item two' }))
      const originalAccessed1 = item1.last_accessed
      const originalAccessed2 = item2.last_accessed

      const result = index.search({})
      expect(result.items).toHaveLength(2)

      for (const item of result.items) {
        expect(item.last_accessed >= originalAccessed1).toBe(true)
        expect(item.last_accessed >= originalAccessed2).toBe(true)
      }

      // Verify the DB was actually updated
      const row = db
        .prepare('SELECT last_accessed FROM memory_items WHERE memory_id = ?')
        .get(item1.memory_id) as { last_accessed: string }
      expect(row.last_accessed >= originalAccessed1).toBe(true)
    })

    it('updates last_accessed on FTS5 search results', () => {
      const item = service.create(makeInput({ text: 'Unique searchable content here' }))
      const originalAccessed = item.last_accessed

      const result = index.search({ text: 'searchable' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].last_accessed >= originalAccessed).toBe(true)
    })
  })

  describe('limit and offset', () => {
    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        service.create(makeInput({ text: `Item ${i}` }))
      }

      const result = index.search({ limit: 2 })
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(5)
    })

    it('respects offset parameter', () => {
      for (let i = 0; i < 5; i++) {
        service.create(makeInput({ text: `Item ${i}` }))
      }

      const allResult = index.search({ limit: 100 })
      const offsetResult = index.search({ limit: 2, offset: 2 })

      expect(offsetResult.items).toHaveLength(2)
      expect(offsetResult.total).toBe(5)
      // Offset items should differ from the first page
      const firstPageIds = index.search({ limit: 2, offset: 0 }).items.map((i) => i.memory_id)
      for (const item of offsetResult.items) {
        expect(firstPageIds).not.toContain(item.memory_id)
      }
    })

    it('defaults limit to 20 and offset to 0', () => {
      for (let i = 0; i < 3; i++) {
        service.create(makeInput({ text: `Item ${i}` }))
      }

      const result = index.search({})
      expect(result.items).toHaveLength(3)
      expect(result.total).toBe(3)
    })

    it('supports limit and offset with FTS5 search', () => {
      for (let i = 0; i < 5; i++) {
        service.create(makeInput({ text: `Quantum physics topic ${i}` }))
      }

      const result = index.search({ text: 'quantum', limit: 2, offset: 1 })
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(5)
      expect(result.relevance_scores).toHaveLength(2)
    })
  })

  describe('edge cases', () => {
    it('returns empty results when no items exist', () => {
      const result = index.search({})
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('handles empty text query gracefully', () => {
      service.create(makeInput({ text: 'Some content' }))

      const result = index.search({ text: '' })
      // Empty text should fall back to non-FTS path
      expect(result.items).toHaveLength(1)
      expect(result.relevance_scores).toBeUndefined()
    })

    it('handles whitespace-only text query gracefully', () => {
      service.create(makeInput({ text: 'Some content' }))

      const result = index.search({ text: '   ' })
      expect(result.items).toHaveLength(1)
      expect(result.relevance_scores).toBeUndefined()
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 5: Search Filter Correctness
// **Validates: Requirements 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.3, 10.2, 10.6**
// ---------------------------------------------------------------------------

import * as fc from 'fast-check'
import type {
  MemoryType,
  MemoryLayer,
  SourceType,
  QuadrantId,
  Provenance,
  MemoryItem,
  SearchQuery as SearchQueryType,
} from './models'

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

const quadrantIdArb: fc.Arbitrary<QuadrantId> = fc.constantFrom(
  'lifeforce',
  'industry',
  'fellowship',
  'essence',
)

const provenanceArb: fc.Arbitrary<Provenance> = fc.record({
  source_type: sourceTypeArb,
  source_id: fc.string({ minLength: 1, maxLength: 32 }),
  agent_id: fc.option(
    fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
    { nil: null },
  ),
})

/** Simple alpha word for FTS-safe text content. */
const wordArb = fc.stringMatching(/^[a-z]{3,10}$/)

/**
 * Arbitrary for a single tag — lowercase alpha only to avoid JSON/LIKE edge
 * cases with special characters.
 */
const tagArb = fc.stringMatching(/^[a-z]{2,12}$/)

/**
 * Arbitrary for CreateMemoryItemInput with controlled text (space-separated
 * alpha words) so FTS5 tokenization is predictable.
 */
const createInputArb: fc.Arbitrary<CreateMemoryItemInput> = fc
  .record({
    words: fc.array(wordArb, { minLength: 1, maxLength: 8 }),
    type: memoryTypeArb,
    layer: memoryLayerArb,
    provenance: provenanceArb,
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    importance: fc.double({ min: 0, max: 1, noNaN: true }),
    userTags: fc.array(tagArb, { maxLength: 5 }),
    quadrant: fc.option(quadrantIdArb, { nil: undefined }),
  })
  .map(({ words, type, layer, provenance, confidence, importance, userTags, quadrant }) => {
    const tags = [...userTags]
    if (quadrant) tags.push(`quadrant:${quadrant}`)
    return {
      text: words.join(' '),
      type,
      layer,
      provenance,
      confidence,
      importance,
      tags,
    } satisfies CreateMemoryItemInput
  })

/**
 * Build a search query by optionally picking filter values from the set of
 * items that were actually inserted. This ensures filters can actually match
 * something (but we still verify correctness for all items).
 */
function searchQueryArb(items: CreateMemoryItemInput[]): fc.Arbitrary<SearchQueryType> {
  // Collect the universe of values present in the items
  const types = Array.from(new Set(items.map((i) => i.type)))
  const layers = Array.from(new Set(items.map((i) => i.layer)))
  const sourceTypes = Array.from(new Set(items.map((i) => i.provenance.source_type)))
  const agentIds = Array.from(new Set(items.map((i) => i.provenance.agent_id).filter(Boolean))) as string[]
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags ?? []).filter((t) => !t.startsWith('quadrant:'))))
  const quadrants = Array.from(
    new Set(
      items
        .flatMap((i) => i.tags ?? [])
        .filter((t) => t.startsWith('quadrant:'))
        .map((t) => t.replace('quadrant:', '') as QuadrantId),
    ),
  )
  // Collect individual words from item texts for FTS queries
  const allWords = Array.from(new Set(items.flatMap((i) => i.text.split(/\s+/).filter((w) => w.length > 0))))

  return fc.record({
    type: types.length > 0 ? fc.option(fc.constantFrom(...types), { nil: undefined }) : fc.constant(undefined),
    layer: layers.length > 0 ? fc.option(fc.constantFrom(...layers), { nil: undefined }) : fc.constant(undefined),
    source_type: sourceTypes.length > 0 ? fc.option(fc.constantFrom(...sourceTypes), { nil: undefined }) : fc.constant(undefined),
    agent_id: agentIds.length > 0 ? fc.option(fc.constantFrom(...agentIds), { nil: undefined }) : fc.constant(undefined),
    tags: allTags.length > 0
      ? fc.option(
          fc.subarray(allTags, { minLength: 1, maxLength: Math.min(3, allTags.length) }),
          { nil: undefined },
        )
      : fc.constant(undefined),
    quadrant: quadrants.length > 0 ? fc.option(fc.constantFrom(...quadrants), { nil: undefined }) : fc.constant(undefined),
    text: allWords.length > 0 ? fc.option(fc.constantFrom(...allWords), { nil: undefined }) : fc.constant(undefined),
  }) as fc.Arbitrary<SearchQueryType>
}

/**
 * Check whether a single item (from its CreateMemoryItemInput) matches all
 * the specified search filters. This is the "oracle" — a simple, obviously
 * correct implementation of the filter logic used to verify the DB-backed
 * MemoryIndex.
 */
function itemMatchesFilters(input: CreateMemoryItemInput, query: SearchQueryType): boolean {
  if (query.type && input.type !== query.type) return false
  if (query.layer && input.layer !== query.layer) return false
  if (query.source_type && input.provenance.source_type !== query.source_type) return false
  if (query.agent_id && input.provenance.agent_id !== query.agent_id) return false

  // Tags filter: item must have at least one of the query tags (OR semantics)
  if (query.tags && query.tags.length > 0) {
    const itemTags = input.tags ?? []
    const hasAny = query.tags.some((t) => itemTags.includes(t))
    if (!hasAny) return false
  }

  // Quadrant filter: item must have the quadrant tag
  if (query.quadrant) {
    const itemTags = input.tags ?? []
    if (!itemTags.includes(`quadrant:${query.quadrant}`)) return false
  }

  // Full-text: for single-word queries on alpha-only text, a simple includes
  // check is equivalent to FTS5 tokenized matching.
  if (query.text) {
    const words = input.text.toLowerCase().split(/\s+/)
    if (!words.includes(query.text.toLowerCase())) return false
  }

  return true
}

describe('Property: Search Filter Correctness', () => {
  let db: Database.Database
  let service: MemoryService
  let index: MemoryIndex

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
    index = new MemoryIndex(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('all returned items match every specified filter (soundness)', () => {
    fc.assert(
      fc.property(
        fc.array(createInputArb, { minLength: 1, maxLength: 15 }).chain((inputs) =>
          fc.tuple(fc.constant(inputs), searchQueryArb(inputs)),
        ),
        ([inputs, query]) => {
          // Fresh DB per iteration to avoid cross-iteration accumulation
          const iterDb = getDatabase(':memory:')
          const iterService = new MemoryService(iterDb)
          const iterIndex = new MemoryIndex(iterDb)

          // Insert all items
          for (const input of inputs) {
            iterService.create(input)
          }

          // Search with high limit to avoid pagination masking
          const result = iterIndex.search({ ...query, limit: 1000 })

          // Soundness: every returned item must match all filters
          for (const item of result.items) {
            if (query.type) {
              expect(item.type).toBe(query.type)
            }
            if (query.layer) {
              expect(item.layer).toBe(query.layer)
            }
            if (query.source_type) {
              expect(item.provenance.source_type).toBe(query.source_type)
            }
            if (query.agent_id) {
              expect(item.provenance.agent_id).toBe(query.agent_id)
            }
            if (query.tags && query.tags.length > 0) {
              const hasAny = query.tags.some((t) => item.tags.includes(t))
              expect(hasAny).toBe(true)
            }
            if (query.quadrant) {
              expect(item.tags).toContain(`quadrant:${query.quadrant}`)
            }
            if (query.text) {
              const words = item.text.toLowerCase().split(/\s+/)
              expect(words).toContain(query.text.toLowerCase())
            }
          }

          closeDatabase(iterDb)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('no item matching all criteria is excluded from results (completeness)', () => {
    fc.assert(
      fc.property(
        fc.array(createInputArb, { minLength: 1, maxLength: 15 }).chain((inputs) =>
          fc.tuple(fc.constant(inputs), searchQueryArb(inputs)),
        ),
        ([inputs, query]) => {
          // Fresh DB per iteration to avoid cross-iteration accumulation
          const iterDb = getDatabase(':memory:')
          const iterService = new MemoryService(iterDb)
          const iterIndex = new MemoryIndex(iterDb)

          // Insert all items, track input→id mapping
          const idToInput = new Map<string, CreateMemoryItemInput>()
          for (const input of inputs) {
            const item = iterService.create(input)
            idToInput.set(item.memory_id, input)
          }

          // Search with high limit
          const result = iterIndex.search({ ...query, limit: 1000 })
          const returnedIds = new Set(result.items.map((i) => i.memory_id))

          // Completeness: every item that matches all filters via our oracle
          // must appear in the results
          idToInput.forEach((input, id) => {
            if (itemMatchesFilters(input, query)) {
              expect(returnedIds.has(id)).toBe(true)
            }
          })

          // Also verify total count matches
          let expectedCount = 0
          idToInput.forEach((input) => {
            if (itemMatchesFilters(input, query)) expectedCount++
          })
          expect(result.total).toBe(expectedCount)

          closeDatabase(iterDb)
        },
      ),
      { numRuns: 100 },
    )
  })
})
