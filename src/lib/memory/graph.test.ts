import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { getDatabase, closeDatabase } from './db'
import { MemoryService } from './service'
import { MemoryGraph } from './graph'
import type { CreateMemoryItemInput, MemoryItem } from './models'

function makeInput(overrides: Partial<CreateMemoryItemInput> = {}): CreateMemoryItemInput {
  return {
    text: 'Test memory item',
    type: 'episodic',
    layer: 'daily_notes',
    provenance: { source_type: 'user_input', source_id: 'test', agent_id: null },
    confidence: 0.8,
    importance: 0.7,
    ...overrides,
  }
}

describe('MemoryGraph', () => {
  let db: Database.Database
  let service: MemoryService
  let graph: MemoryGraph
  let itemA: MemoryItem
  let itemB: MemoryItem
  let itemC: MemoryItem

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
    graph = new MemoryGraph(db)

    itemA = service.create(makeInput({ text: 'Node A' }))
    itemB = service.create(makeInput({ text: 'Node B' }))
    itemC = service.create(makeInput({ text: 'Node C' }))
  })

  afterEach(() => {
    closeDatabase(db)
  })

  describe('addEdge', () => {
    it('creates an edge with all required fields', () => {
      const edge = graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 0.8,
      })

      expect(edge.edge_id).toBeDefined()
      expect(edge.edge_id.length).toBeGreaterThan(0)
      expect(edge.source_memory_id).toBe(itemA.memory_id)
      expect(edge.target_memory_id).toBe(itemB.memory_id)
      expect(edge.relationship_type).toBe('related_to')
      expect(edge.weight).toBe(0.8)
      expect(edge.created_at).toBeDefined()
    })

    it('rejects edge with non-existent source', () => {
      expect(() =>
        graph.addEdge({
          source_memory_id: 'nonexistent',
          target_memory_id: itemB.memory_id,
          relationship_type: 'related_to',
          weight: 1.0,
        }),
      ).toThrow('Source memory item not found: nonexistent')
    })

    it('rejects edge with non-existent target', () => {
      expect(() =>
        graph.addEdge({
          source_memory_id: itemA.memory_id,
          target_memory_id: 'nonexistent',
          relationship_type: 'related_to',
          weight: 1.0,
        }),
      ).toThrow('Target memory item not found: nonexistent')
    })

    it('generates unique edge IDs', () => {
      const e1 = graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      const e2 = graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      expect(e1.edge_id).not.toBe(e2.edge_id)
    })
  })

  describe('removeEdge', () => {
    it('removes an existing edge and returns true', () => {
      const edge = graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      expect(graph.removeEdge(edge.edge_id)).toBe(true)
      expect(graph.getOutgoing(itemA.memory_id)).toHaveLength(0)
    })

    it('returns false for non-existent edge', () => {
      expect(graph.removeEdge('nonexistent')).toBe(false)
    })
  })

  describe('getOutgoing', () => {
    it('returns all outgoing edges from a node', () => {
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'depends_on',
        weight: 0.5,
      })

      const outgoing = graph.getOutgoing(itemA.memory_id)
      expect(outgoing).toHaveLength(2)
      expect(outgoing.map((e) => e.target_memory_id).sort()).toEqual(
        [itemB.memory_id, itemC.memory_id].sort(),
      )
    })

    it('returns empty array when no outgoing edges', () => {
      expect(graph.getOutgoing(itemA.memory_id)).toHaveLength(0)
    })
  })

  describe('getIncoming', () => {
    it('returns all incoming edges to a node', () => {
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemB.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'depends_on',
        weight: 0.5,
      })

      const incoming = graph.getIncoming(itemC.memory_id)
      expect(incoming).toHaveLength(2)
      expect(incoming.map((e) => e.source_memory_id).sort()).toEqual(
        [itemA.memory_id, itemB.memory_id].sort(),
      )
    })

    it('returns empty array when no incoming edges', () => {
      expect(graph.getIncoming(itemA.memory_id)).toHaveLength(0)
    })
  })

  describe('getByType', () => {
    it('returns all edges of a given relationship type', () => {
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'depends_on',
        weight: 0.5,
      })
      graph.addEdge({
        source_memory_id: itemB.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'related_to',
        weight: 0.9,
      })

      const relatedTo = graph.getByType('related_to')
      expect(relatedTo).toHaveLength(2)
      for (const e of relatedTo) {
        expect(e.relationship_type).toBe('related_to')
      }
    })

    it('returns empty array for unknown type', () => {
      expect(graph.getByType('unknown_type')).toHaveLength(0)
    })
  })

  describe('traverse', () => {
    it('returns start node when no outgoing edges', () => {
      const nodes = graph.traverse(itemA.memory_id, 3)
      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe(itemA.memory_id)
    })

    it('follows outgoing edges up to maxDepth', () => {
      // A -> B -> C
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'next',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemB.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'next',
        weight: 1.0,
      })

      const nodes = graph.traverse(itemA.memory_id, 3)
      expect(nodes).toHaveLength(3)
      const ids = nodes.map((n) => n.id).sort()
      expect(ids).toEqual([itemA.memory_id, itemB.memory_id, itemC.memory_id].sort())
    })

    it('respects depth limit', () => {
      // A -> B -> C, depth=1 should only reach A and B
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'next',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemB.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'next',
        weight: 1.0,
      })

      const nodes = graph.traverse(itemA.memory_id, 1)
      expect(nodes).toHaveLength(2)
      const ids = nodes.map((n) => n.id).sort()
      expect(ids).toEqual([itemA.memory_id, itemB.memory_id].sort())
    })

    it('does not revisit nodes in cycles', () => {
      // A -> B -> A (cycle)
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'next',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemB.memory_id,
        target_memory_id: itemA.memory_id,
        relationship_type: 'next',
        weight: 1.0,
      })

      const nodes = graph.traverse(itemA.memory_id, 10)
      expect(nodes).toHaveLength(2)
    })

    it('returns GraphNode with correct fields', () => {
      const nodes = graph.traverse(itemA.memory_id, 1)
      expect(nodes).toHaveLength(1)
      const node = nodes[0]
      expect(node.id).toBe(itemA.memory_id)
      expect(node.label).toBe('Node A')
      expect(node.type).toBe('episodic')
      expect(node.importance).toBe(0.7)
    })

    it('extracts quadrant from tags', () => {
      const itemQ = service.create(
        makeInput({ text: 'Quadrant item', tags: ['quadrant:lifeforce', 'health'] }),
      )
      const nodes = graph.traverse(itemQ.memory_id, 1)
      expect(nodes[0].quadrant).toBe('lifeforce')
    })

    it('returns null quadrant when no quadrant tag', () => {
      const nodes = graph.traverse(itemA.memory_id, 1)
      expect(nodes[0].quadrant).toBeNull()
    })
  })

  describe('exportSubgraph', () => {
    it('returns nodes and edges in D3.js compatible format', () => {
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 0.8,
      })

      const result = graph.exportSubgraph(itemA.memory_id, 3)
      expect(result.nodes).toHaveLength(2)
      expect(result.edges).toHaveLength(1)
      expect(result.edges[0]).toEqual({
        source: itemA.memory_id,
        target: itemB.memory_id,
        label: 'related_to',
        weight: 0.8,
      })
    })

    it('every edge source and target references a node in the nodes array', () => {
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemB.memory_id,
        target_memory_id: itemC.memory_id,
        relationship_type: 'next',
        weight: 0.5,
      })

      const result = graph.exportSubgraph(itemA.memory_id, 3)
      const nodeIds = new Set(result.nodes.map((n) => n.id))
      for (const edge of result.edges) {
        expect(nodeIds.has(edge.source)).toBe(true)
        expect(nodeIds.has(edge.target)).toBe(true)
      }
    })

    it('applies quadrant filter', () => {
      const itemLF = service.create(
        makeInput({ text: 'Lifeforce item', tags: ['quadrant:lifeforce'] }),
      )
      const itemInd = service.create(
        makeInput({ text: 'Industry item', tags: ['quadrant:industry'] }),
      )
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemLF.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemInd.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })

      const result = graph.exportSubgraph(itemA.memory_id, 3, { quadrant: 'lifeforce' })
      // Only the lifeforce node should remain (itemA has no quadrant, so it's filtered out too)
      expect(result.nodes.every((n) => n.quadrant === 'lifeforce')).toBe(true)
    })

    it('applies type filter', () => {
      const itemSem = service.create(makeInput({ text: 'Semantic item', type: 'semantic' }))
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemSem.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })

      const result = graph.exportSubgraph(itemA.memory_id, 3, { type: 'semantic' })
      expect(result.nodes.every((n) => n.type === 'semantic')).toBe(true)
    })

    it('applies minImportance filter', () => {
      const itemLow = service.create(makeInput({ text: 'Low importance', importance: 0.1 }))
      const itemHigh = service.create(makeInput({ text: 'High importance', importance: 0.9 }))
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemLow.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemHigh.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })

      const result = graph.exportSubgraph(itemA.memory_id, 3, { minImportance: 0.5 })
      expect(result.nodes.every((n) => n.importance >= 0.5)).toBe(true)
    })

    it('only includes edges between filtered nodes', () => {
      const itemSem = service.create(makeInput({ text: 'Semantic', type: 'semantic' }))
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'r1',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemSem.memory_id,
        relationship_type: 'r2',
        weight: 1.0,
      })

      // Filter to semantic only — itemA (episodic) and itemB (episodic) are excluded
      const result = graph.exportSubgraph(itemA.memory_id, 3, { type: 'semantic' })
      const nodeIds = new Set(result.nodes.map((n) => n.id))
      for (const edge of result.edges) {
        expect(nodeIds.has(edge.source)).toBe(true)
        expect(nodeIds.has(edge.target)).toBe(true)
      }
    })
  })

  describe('cascade delete', () => {
    it('removes all edges when a memory item is deleted (SQLite ON DELETE CASCADE)', () => {
      graph.addEdge({
        source_memory_id: itemA.memory_id,
        target_memory_id: itemB.memory_id,
        relationship_type: 'related_to',
        weight: 1.0,
      })
      graph.addEdge({
        source_memory_id: itemC.memory_id,
        target_memory_id: itemA.memory_id,
        relationship_type: 'depends_on',
        weight: 0.5,
      })

      // Delete itemA — both edges (outgoing and incoming) should be removed
      service.delete(itemA.memory_id)

      expect(graph.getOutgoing(itemA.memory_id)).toHaveLength(0)
      expect(graph.getIncoming(itemA.memory_id)).toHaveLength(0)
      // itemB and itemC edges to/from A should also be gone
      expect(graph.getIncoming(itemB.memory_id)).toHaveLength(0)
      expect(graph.getOutgoing(itemC.memory_id)).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 16: Graph Edge Integrity
// **Validates: Requirements 19.1, 19.2, 19.3**
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
  text: fc.string({ minLength: 1, maxLength: 200 }),
  type: memoryTypeArb,
  layer: memoryLayerArb,
  provenance: provenanceArb,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  importance: fc.double({ min: 0, max: 1, noNaN: true }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 32 }), { maxLength: 5 }),
  bypass_quality_gate: fc.constant(true),
})

const relationshipTypeArb = fc.constantFrom(
  'related_to',
  'depends_on',
  'causes',
  'part_of',
  'next',
)

const weightArb = fc.double({ min: 0, max: 1, noNaN: true })

// --- Property 16: Graph Edge Integrity ---

describe('Property 16: Graph Edge Integrity', () => {
  /**
   * **Validates: Requirements 19.1, 19.2, 19.3**
   *
   * For any MemoryEdge, both source_memory_id and target_memory_id SHALL reference
   * existing MemoryItems. Creating an edge with a non-existent node SHALL be rejected.
   * When a MemoryItem is deleted, all edges where it is source or target SHALL be removed.
   */

  let db: Database.Database
  let service: MemoryService
  let graph: MemoryGraph

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
    graph = new MemoryGraph(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('edges between existing items are created successfully with valid endpoints', () => {
    fc.assert(
      fc.property(
        createInputArb,
        createInputArb,
        relationshipTypeArb,
        weightArb,
        (inputA, inputB, relType, weight) => {
          const itemA = service.create(inputA)
          const itemB = service.create(inputB)

          const edge = graph.addEdge({
            source_memory_id: itemA.memory_id,
            target_memory_id: itemB.memory_id,
            relationship_type: relType,
            weight,
          })

          // Both endpoints reference existing items
          expect(service.getById(edge.source_memory_id)).not.toBeNull()
          expect(service.getById(edge.target_memory_id)).not.toBeNull()
          expect(edge.source_memory_id).toBe(itemA.memory_id)
          expect(edge.target_memory_id).toBe(itemB.memory_id)
          expect(edge.relationship_type).toBe(relType)
          expect(edge.weight).toBe(weight)
          expect(edge.edge_id).toBeDefined()
          expect(edge.created_at).toBeDefined()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('creating an edge with a non-existent source is rejected', () => {
    fc.assert(
      fc.property(
        createInputArb,
        fc.string({ minLength: 1, maxLength: 64 }),
        relationshipTypeArb,
        weightArb,
        (input, fakeId, relType, weight) => {
          const item = service.create(input)

          expect(() =>
            graph.addEdge({
              source_memory_id: fakeId,
              target_memory_id: item.memory_id,
              relationship_type: relType,
              weight,
            }),
          ).toThrow()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('creating an edge with a non-existent target is rejected', () => {
    fc.assert(
      fc.property(
        createInputArb,
        fc.string({ minLength: 1, maxLength: 64 }),
        relationshipTypeArb,
        weightArb,
        (input, fakeId, relType, weight) => {
          const item = service.create(input)

          expect(() =>
            graph.addEdge({
              source_memory_id: item.memory_id,
              target_memory_id: fakeId,
              relationship_type: relType,
              weight,
            }),
          ).toThrow()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('deleting a node removes all edges where it is source or target', () => {
    fc.assert(
      fc.property(
        fc.array(createInputArb, { minLength: 3, maxLength: 6 }),
        fc.integer({ min: 0 }),
        (inputs, seed) => {
          const items = inputs.map((input) => service.create(input))

          // Pick a node to delete (the one at index determined by seed)
          const deleteIdx = seed % items.length
          const targetItem = items[deleteIdx]

          // Create edges from targetItem to others and from others to targetItem
          for (let i = 0; i < items.length; i++) {
            if (i === deleteIdx) continue
            graph.addEdge({
              source_memory_id: targetItem.memory_id,
              target_memory_id: items[i].memory_id,
              relationship_type: 'related_to',
              weight: 1.0,
            })
            graph.addEdge({
              source_memory_id: items[i].memory_id,
              target_memory_id: targetItem.memory_id,
              relationship_type: 'depends_on',
              weight: 0.5,
            })
          }

          // Verify edges exist before deletion
          expect(graph.getOutgoing(targetItem.memory_id).length).toBeGreaterThan(0)
          expect(graph.getIncoming(targetItem.memory_id).length).toBeGreaterThan(0)

          // Delete the node
          service.delete(targetItem.memory_id)

          // All edges involving the deleted node should be gone
          expect(graph.getOutgoing(targetItem.memory_id)).toHaveLength(0)
          expect(graph.getIncoming(targetItem.memory_id)).toHaveLength(0)

          // Verify no remaining edges reference the deleted node
          for (const item of items) {
            if (item.memory_id === targetItem.memory_id) continue
            const outgoing = graph.getOutgoing(item.memory_id)
            const incoming = graph.getIncoming(item.memory_id)
            for (const e of outgoing) {
              expect(e.target_memory_id).not.toBe(targetItem.memory_id)
            }
            for (const e of incoming) {
              expect(e.source_memory_id).not.toBe(targetItem.memory_id)
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 17: Graph Traversal Depth Bound
// **Validates: Requirements 19.7**
// ---------------------------------------------------------------------------

describe('Property 17: Graph Traversal Depth Bound', () => {
  /**
   * **Validates: Requirements 19.7**
   *
   * For any starting node and depth limit N, BFS traversal of the Memory_Graph
   * SHALL return only nodes reachable within N hops. No node at depth > N SHALL
   * appear in the results.
   */

  let db: Database.Database
  let service: MemoryService
  let graph: MemoryGraph

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
    graph = new MemoryGraph(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('BFS traversal returns only nodes within N hops of the start', () => {
    fc.assert(
      fc.property(
        // Chain length: 3–8 nodes forming A→B→C→D→...
        fc.integer({ min: 3, max: 8 }),
        // Depth limit: 1–7
        fc.integer({ min: 1, max: 7 }),
        (chainLength, depthLimit) => {
          // Create a chain of nodes
          const chainItems = []
          for (let i = 0; i < chainLength; i++) {
            chainItems.push(
              service.create({
                text: `Chain node ${i}`,
                type: 'episodic',
                layer: 'daily_notes',
                provenance: { source_type: 'user_input', source_id: 'test', agent_id: null },
                confidence: 0.8,
                importance: 0.7,
                tags: [],
                bypass_quality_gate: true,
              }),
            )
          }

          // Link them: 0→1→2→3→...
          for (let i = 0; i < chainItems.length - 1; i++) {
            graph.addEdge({
              source_memory_id: chainItems[i].memory_id,
              target_memory_id: chainItems[i + 1].memory_id,
              relationship_type: 'next',
              weight: 1.0,
            })
          }

          // Traverse from the first node with the given depth limit
          const result = graph.traverse(chainItems[0].memory_id, depthLimit)
          const resultIds = new Set(result.map((n) => n.id))

          // Nodes within depthLimit hops should be present
          const expectedCount = Math.min(depthLimit + 1, chainLength)
          for (let i = 0; i < expectedCount; i++) {
            expect(resultIds.has(chainItems[i].memory_id)).toBe(true)
          }

          // Nodes beyond depthLimit hops should NOT be present
          for (let i = expectedCount; i < chainLength; i++) {
            expect(resultIds.has(chainItems[i].memory_id)).toBe(false)
          }

          // Total result count should match expected
          expect(result.length).toBe(expectedCount)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests — fast-check
// Feature: octavius-memory-architecture, Property 18: Graph Export Structure
// **Validates: Requirements 19.8, 24.1, 24.2, 24.3, 24.4**
// ---------------------------------------------------------------------------

describe('Property 18: Graph Export Structure', () => {
  /**
   * **Validates: Requirements 19.8, 24.1, 24.2, 24.3, 24.4**
   *
   * For any subgraph export, the output SHALL contain a nodes array (each with id,
   * label, type, quadrant, importance) and an edges array (each with source, target,
   * label, weight). Every edge's source and target SHALL reference a node id present
   * in the nodes array.
   */

  let db: Database.Database
  let service: MemoryService
  let graph: MemoryGraph

  beforeEach(() => {
    db = getDatabase(':memory:')
    service = new MemoryService(db)
    graph = new MemoryGraph(db)
  })

  afterEach(() => {
    closeDatabase(db)
  })

  it('exported subgraph has correct node and edge structure with referential integrity', () => {
    fc.assert(
      fc.property(
        // Number of nodes: 2–6
        fc.integer({ min: 2, max: 6 }),
        // Number of edges to attempt (may be fewer if duplicates)
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 5 }),
        (nodeCount, edgeAttempts, depth) => {
          // Create nodes with varied types and quadrant tags
          const quadrantTags = [
            ['quadrant:lifeforce'],
            ['quadrant:industry'],
            ['quadrant:fellowship'],
            ['quadrant:essence'],
            [],
          ]
          const types: MemoryType[] = ['episodic', 'semantic', 'procedural', 'entity_profile']

          const items = []
          for (let i = 0; i < nodeCount; i++) {
            items.push(
              service.create({
                text: `Export node ${i} with some content`,
                type: types[i % types.length],
                layer: 'daily_notes',
                provenance: { source_type: 'user_input', source_id: 'test', agent_id: null },
                confidence: 0.8,
                importance: 0.3 + (i * 0.1),
                tags: quadrantTags[i % quadrantTags.length],
                bypass_quality_gate: true,
              }),
            )
          }

          // Create edges between random pairs (from first node outward to ensure connectivity)
          const createdEdges = new Set<string>()
          for (let i = 0; i < edgeAttempts; i++) {
            const srcIdx = i % nodeCount
            const tgtIdx = (srcIdx + 1 + (i % (nodeCount - 1))) % nodeCount
            if (srcIdx === tgtIdx) continue
            const key = `${srcIdx}-${tgtIdx}`
            if (createdEdges.has(key)) continue
            createdEdges.add(key)

            graph.addEdge({
              source_memory_id: items[srcIdx].memory_id,
              target_memory_id: items[tgtIdx].memory_id,
              relationship_type: 'related_to',
              weight: 0.5 + (i % 5) * 0.1,
            })
          }

          // Export subgraph from the first node
          const exported = graph.exportSubgraph(items[0].memory_id, depth)

          // Verify nodes array structure
          expect(Array.isArray(exported.nodes)).toBe(true)
          expect(exported.nodes.length).toBeGreaterThan(0)

          for (const node of exported.nodes) {
            // Each node has required fields
            expect(typeof node.id).toBe('string')
            expect(node.id.length).toBeGreaterThan(0)
            expect(typeof node.label).toBe('string')
            expect(node.label.length).toBeGreaterThan(0)
            expect(['episodic', 'semantic', 'procedural', 'entity_profile']).toContain(node.type)
            expect(
              node.quadrant === null ||
              ['lifeforce', 'industry', 'fellowship', 'essence'].includes(node.quadrant),
            ).toBe(true)
            expect(typeof node.importance).toBe('number')
            expect(node.importance).toBeGreaterThanOrEqual(0)
            expect(node.importance).toBeLessThanOrEqual(1)
          }

          // Verify edges array structure
          expect(Array.isArray(exported.edges)).toBe(true)

          const nodeIds = new Set(exported.nodes.map((n) => n.id))

          for (const edge of exported.edges) {
            // Each edge has required fields
            expect(typeof edge.source).toBe('string')
            expect(typeof edge.target).toBe('string')
            expect(typeof edge.label).toBe('string')
            expect(typeof edge.weight).toBe('number')
            expect(edge.weight).toBeGreaterThanOrEqual(0)
            expect(edge.weight).toBeLessThanOrEqual(1)

            // Every edge's source and target reference a node in the nodes array
            expect(nodeIds.has(edge.source)).toBe(true)
            expect(nodeIds.has(edge.target)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
