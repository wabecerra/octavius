import { describe, it, expect } from 'vitest'
import type { MemoryItem } from './models'
import {
  serializeMemoryItem,
  deserializeMemoryItem,
  prettyPrintMemoryItem,
} from './serialization'

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    memory_id: 'mem-abc123',
    text: 'Morning run completed, 5km in 28 minutes',
    type: 'episodic',
    layer: 'daily_notes',
    provenance: {
      source_type: 'user_input',
      source_id: 'dashboard',
      agent_id: null,
    },
    created_at: '2025-01-15T08:30:00.000Z',
    last_accessed: '2025-01-15T10:00:00.000Z',
    confidence: 0.85,
    importance: 0.7,
    tags: ['health', 'quadrant:lifeforce'],
    embedding_ref: null,
    consolidated_into: null,
    archived: false,
    ...overrides,
  }
}

describe('serializeMemoryItem', () => {
  it('produces valid JSON', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('preserves consistent field ordering', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const keys = Object.keys(JSON.parse(json))
    expect(keys).toEqual([
      'memory_id',
      'text',
      'type',
      'layer',
      'provenance',
      'created_at',
      'last_accessed',
      'confidence',
      'importance',
      'tags',
      'embedding_ref',
      'consolidated_into',
      'archived',
    ])
  })

  it('includes all field values in the output', () => {
    const item = makeItem({
      embedding_ref: 'emb-xyz',
      consolidated_into: 'mem-parent',
      archived: true,
    })
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    expect(parsed.memory_id).toBe('mem-abc123')
    expect(parsed.text).toBe('Morning run completed, 5km in 28 minutes')
    expect(parsed.type).toBe('episodic')
    expect(parsed.layer).toBe('daily_notes')
    expect(parsed.provenance).toEqual({
      source_type: 'user_input',
      source_id: 'dashboard',
      agent_id: null,
    })
    expect(parsed.confidence).toBe(0.85)
    expect(parsed.importance).toBe(0.7)
    expect(parsed.tags).toEqual(['health', 'quadrant:lifeforce'])
    expect(parsed.embedding_ref).toBe('emb-xyz')
    expect(parsed.consolidated_into).toBe('mem-parent')
    expect(parsed.archived).toBe(true)
  })
})

describe('deserializeMemoryItem', () => {
  it('parses valid JSON back to a MemoryItem', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const result = deserializeMemoryItem(json)
    expect(result).toEqual(item)
  })

  it('throws on invalid JSON', () => {
    expect(() => deserializeMemoryItem('not json')).toThrow('Invalid JSON')
  })

  it('throws on JSON array', () => {
    expect(() => deserializeMemoryItem('[]')).toThrow('expected a JSON object')
  })

  it('throws on JSON null', () => {
    expect(() => deserializeMemoryItem('null')).toThrow('expected a JSON object')
  })

  it('throws on missing memory_id', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    delete parsed.memory_id
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow("'memory_id'")
  })

  it('throws on missing text', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    delete parsed.text
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow("'text'")
  })

  it('throws on missing provenance', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    delete parsed.provenance
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow("'provenance'")
  })

  it('throws on missing confidence', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    delete parsed.confidence
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow("'confidence'")
  })

  it('throws on missing tags', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    parsed.tags = 'not-an-array'
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow("'tags'")
  })

  it('throws on missing archived', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    delete parsed.archived
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow("'archived'")
  })

  it('throws on invalid type enum', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    parsed.type = 'invalid_type'
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow('type must be one of')
  })

  it('throws on invalid layer enum', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    parsed.layer = 'invalid_layer'
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow('layer must be one of')
  })

  it('throws on invalid provenance.source_type', () => {
    const item = makeItem()
    const json = serializeMemoryItem(item)
    const parsed = JSON.parse(json)
    parsed.provenance.source_type = 'bad_source'
    expect(() => deserializeMemoryItem(JSON.stringify(parsed))).toThrow('provenance.source_type must be one of')
  })
})

describe('serializeMemoryItem / deserializeMemoryItem round-trip', () => {
  it('round-trips a basic item', () => {
    const item = makeItem()
    const result = deserializeMemoryItem(serializeMemoryItem(item))
    expect(result).toEqual(item)
  })

  it('round-trips an item with all optional fields set', () => {
    const item = makeItem({
      embedding_ref: 'emb-ref-001',
      consolidated_into: 'mem-parent-002',
      archived: true,
      provenance: {
        source_type: 'agent_output',
        source_id: 'agent-run-42',
        agent_id: 'agent-lifeforce',
      },
      tags: ['quadrant:lifeforce', 'sleep', 'health', 'morning'],
    })
    const result = deserializeMemoryItem(serializeMemoryItem(item))
    expect(result).toEqual(item)
  })

  it('round-trips an item with empty tags', () => {
    const item = makeItem({ tags: [] })
    const result = deserializeMemoryItem(serializeMemoryItem(item))
    expect(result).toEqual(item)
  })
})

describe('prettyPrintMemoryItem', () => {
  it('contains the memory_id', () => {
    const item = makeItem()
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain(item.memory_id)
  })

  it('contains the type', () => {
    const item = makeItem()
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain(item.type)
  })

  it('contains the layer', () => {
    const item = makeItem()
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain(item.layer)
  })

  it('contains the text content', () => {
    const item = makeItem()
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain(item.text)
  })

  it('contains provenance info', () => {
    const item = makeItem({
      provenance: {
        source_type: 'agent_output',
        source_id: 'run-99',
        agent_id: 'agent-industry',
      },
    })
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain('agent_output')
    expect(md).toContain('run-99')
    expect(md).toContain('agent-industry')
  })

  it('contains confidence and importance scores', () => {
    const item = makeItem({ confidence: 0.92, importance: 0.45 })
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain('0.92')
    expect(md).toContain('0.45')
  })

  it('contains all tags', () => {
    const item = makeItem({ tags: ['health', 'quadrant:lifeforce', 'morning'] })
    const md = prettyPrintMemoryItem(item)
    for (const tag of item.tags) {
      expect(md).toContain(tag)
    }
  })

  it('contains timestamps', () => {
    const item = makeItem()
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain(item.created_at)
    expect(md).toContain(item.last_accessed)
  })

  it('contains archived status', () => {
    const item = makeItem({ archived: true })
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain('Yes')
  })

  it('shows "None" for null agent_id', () => {
    const item = makeItem()
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain('None')
  })

  it('shows "No tags" when tags array is empty', () => {
    const item = makeItem({ tags: [] })
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain('No tags')
  })

  it('includes embedding_ref and consolidated_into when set', () => {
    const item = makeItem({
      embedding_ref: 'emb-ref-abc',
      consolidated_into: 'mem-parent-xyz',
    })
    const md = prettyPrintMemoryItem(item)
    expect(md).toContain('emb-ref-abc')
    expect(md).toContain('mem-parent-xyz')
  })
})

import fc from 'fast-check'

/**
 * Feature: octavious-memory-architecture, Property 3: JSON Serialization Round-Trip
 *
 * **Validates: Requirements 1.6**
 *
 * For any valid MemoryItem, serializing it to JSON and then deserializing
 * the JSON back SHALL produce a deeply equal MemoryItem with all fields preserved.
 */
// Shared ISO date arbitrary: generates timestamps in a safe range as ISO 8601 strings
const isoDateArb = fc
  .integer({ min: 946684800000, max: 4102444799000 }) // 2000-01-01 to 2099-12-31
  .map((ms) => new Date(ms).toISOString())

describe('Property 3: JSON Serialization Round-Trip', () => {
  const provenanceArb = fc.record({
    source_type: fc.constantFrom(
      'user_input' as const,
      'agent_output' as const,
      'consolidation' as const,
      'system_event' as const,
      'dashboard_sync' as const,
      'evolution' as const,
    ),
    source_id: fc.string({ minLength: 1 }),
    agent_id: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  })

  const memoryItemArb: fc.Arbitrary<MemoryItem> = fc.record({
    memory_id: fc.string({ minLength: 1 }),
    text: fc.string({ minLength: 1 }),
    type: fc.constantFrom(
      'episodic' as const,
      'semantic' as const,
      'procedural' as const,
      'entity_profile' as const,
    ),
    layer: fc.constantFrom(
      'life_directory' as const,
      'daily_notes' as const,
      'tacit_knowledge' as const,
    ),
    provenance: provenanceArb,
    created_at: isoDateArb,
    last_accessed: isoDateArb,
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    importance: fc.double({ min: 0, max: 1, noNaN: true }),
    tags: fc.array(fc.string({ minLength: 1 })),
    embedding_ref: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    consolidated_into: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    archived: fc.boolean(),
  })

  it('serialize then deserialize produces a deeply equal MemoryItem', () => {
    fc.assert(
      fc.property(memoryItemArb, (item) => {
        const json = serializeMemoryItem(item)
        const roundTripped = deserializeMemoryItem(json)
        expect(roundTripped).toEqual(item)
      }),
      { numRuns: 100 },
    )
  })
})

/**
 * Feature: octavious-memory-architecture, Property 4: Pretty-Printer Field Completeness
 *
 * **Validates: Requirements 1.7**
 *
 * For any valid MemoryItem, the Markdown output of the pretty-printer SHALL contain
 * the memory_id, type, layer, text content, and all tag values as substrings.
 */
describe('Property 4: Pretty-Printer Field Completeness', () => {
  const provenanceArb = fc.record({
    source_type: fc.constantFrom(
      'user_input' as const,
      'agent_output' as const,
      'consolidation' as const,
      'system_event' as const,
      'dashboard_sync' as const,
      'evolution' as const,
    ),
    source_id: fc.string({ minLength: 1 }),
    agent_id: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  })

  const memoryItemArb: fc.Arbitrary<MemoryItem> = fc.record({
    memory_id: fc.string({ minLength: 1 }),
    text: fc.string({ minLength: 1 }),
    type: fc.constantFrom(
      'episodic' as const,
      'semantic' as const,
      'procedural' as const,
      'entity_profile' as const,
    ),
    layer: fc.constantFrom(
      'life_directory' as const,
      'daily_notes' as const,
      'tacit_knowledge' as const,
    ),
    provenance: provenanceArb,
    created_at: isoDateArb,
    last_accessed: isoDateArb,
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    importance: fc.double({ min: 0, max: 1, noNaN: true }),
    tags: fc.array(fc.string({ minLength: 1 })),
    embedding_ref: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    consolidated_into: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    archived: fc.boolean(),
  })

  it('pretty-print output contains memory_id, type, layer, text, and all tags', () => {
    fc.assert(
      fc.property(memoryItemArb, (item) => {
        const md = prettyPrintMemoryItem(item)

        // memory_id must appear as substring
        expect(md).toContain(item.memory_id)

        // type must appear as substring
        expect(md).toContain(item.type)

        // layer must appear as substring
        expect(md).toContain(item.layer)

        // text content must appear as substring
        expect(md).toContain(item.text)

        // every tag value must appear as substring
        for (const tag of item.tags) {
          expect(md).toContain(tag)
        }
      }),
      { numRuns: 100 },
    )
  })
})
