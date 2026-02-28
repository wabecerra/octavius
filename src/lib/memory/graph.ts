import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import type { GraphExport, GraphNode, MemoryEdge, MemoryType, QuadrantId } from './models'

/** Row shape returned by better-sqlite3 for memory_edges queries. */
interface EdgeRow {
  edge_id: string
  source_memory_id: string
  target_memory_id: string
  relationship_type: string
  weight: number
  created_at: string
}

/** Row shape for memory_items fields needed to build GraphNode. */
interface MemoryNodeRow {
  memory_id: string
  text: string
  type: string
  tags: string
  importance: number
}

function rowToEdge(row: EdgeRow): MemoryEdge {
  return {
    edge_id: row.edge_id,
    source_memory_id: row.source_memory_id,
    target_memory_id: row.target_memory_id,
    relationship_type: row.relationship_type,
    weight: row.weight,
    created_at: row.created_at,
  }
}

/** Extract quadrant from tags JSON string. Returns the first quadrant tag found, or null. */
function extractQuadrant(tagsJson: string): QuadrantId | null {
  const tags: string[] = JSON.parse(tagsJson)
  for (const tag of tags) {
    if (tag.startsWith('quadrant:')) {
      const q = tag.slice('quadrant:'.length)
      if (['lifeforce', 'industry', 'fellowship', 'essence'].includes(q)) {
        return q as QuadrantId
      }
    }
  }
  return null
}

/** Build a GraphNode from a memory_items row. Label is text truncated to 80 chars. */
function rowToGraphNode(row: MemoryNodeRow): GraphNode {
  const label = row.text.length > 80 ? `${row.text.slice(0, 77)}...` : row.text
  return {
    id: row.memory_id,
    label,
    type: row.type as MemoryType,
    quadrant: extractQuadrant(row.tags),
    importance: row.importance,
  }
}

export class MemoryGraph {
  constructor(private readonly db: Database.Database) {}

  /**
   * Create a directed edge between two memory items.
   * Validates both source and target exist. Generates edge_id and created_at.
   */
  addEdge(edge: Omit<MemoryEdge, 'edge_id' | 'created_at'>): MemoryEdge {
    // Validate source exists
    const source = this.db
      .prepare('SELECT memory_id FROM memory_items WHERE memory_id = ?')
      .get(edge.source_memory_id) as { memory_id: string } | undefined
    if (!source) {
      throw new Error(`Source memory item not found: ${edge.source_memory_id}`)
    }

    // Validate target exists
    const target = this.db
      .prepare('SELECT memory_id FROM memory_items WHERE memory_id = ?')
      .get(edge.target_memory_id) as { memory_id: string } | undefined
    if (!target) {
      throw new Error(`Target memory item not found: ${edge.target_memory_id}`)
    }

    const edgeId = nanoid()
    const createdAt = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO memory_edges (edge_id, source_memory_id, target_memory_id, relationship_type, weight, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(edgeId, edge.source_memory_id, edge.target_memory_id, edge.relationship_type, edge.weight, createdAt)

    return {
      edge_id: edgeId,
      source_memory_id: edge.source_memory_id,
      target_memory_id: edge.target_memory_id,
      relationship_type: edge.relationship_type,
      weight: edge.weight,
      created_at: createdAt,
    }
  }

  /** Remove an edge by ID. Returns true if an edge was deleted. */
  removeEdge(edgeId: string): boolean {
    const result = this.db.prepare('DELETE FROM memory_edges WHERE edge_id = ?').run(edgeId)
    return result.changes > 0
  }

  /** Get all outgoing edges from a memory item. */
  getOutgoing(memoryId: string): MemoryEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_edges WHERE source_memory_id = ?')
      .all(memoryId) as EdgeRow[]
    return rows.map(rowToEdge)
  }

  /** Get all incoming edges to a memory item. */
  getIncoming(memoryId: string): MemoryEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_edges WHERE target_memory_id = ?')
      .all(memoryId) as EdgeRow[]
    return rows.map(rowToEdge)
  }

  /** Get all edges of a given relationship type. */
  getByType(relationshipType: string): MemoryEdge[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_edges WHERE relationship_type = ?')
      .all(relationshipType) as EdgeRow[]
    return rows.map(rowToEdge)
  }

  /**
   * BFS traversal from a starting node, following outgoing edges.
   * Returns GraphNode[] for all visited nodes (including the start node).
   * Stops at maxDepth hops (default 3).
   */
  traverse(startId: string, maxDepth = 3): GraphNode[] {
    const visited = new Set<string>()
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }]
    visited.add(startId)

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.depth >= maxDepth) continue

      const outgoing = this.db
        .prepare('SELECT target_memory_id FROM memory_edges WHERE source_memory_id = ?')
        .all(current.id) as Array<{ target_memory_id: string }>

      for (const row of outgoing) {
        if (!visited.has(row.target_memory_id)) {
          visited.add(row.target_memory_id)
          queue.push({ id: row.target_memory_id, depth: current.depth + 1 })
        }
      }
    }

    // Build GraphNode[] from visited IDs
    if (visited.size === 0) return []

    const ids = [...visited]
    const placeholders = ids.map(() => '?').join(', ')
    const rows = this.db
      .prepare(
        `SELECT memory_id, text, type, tags, importance FROM memory_items WHERE memory_id IN (${placeholders})`,
      )
      .all(...ids) as MemoryNodeRow[]

    return rows.map(rowToGraphNode)
  }

  /**
   * Export a subgraph starting from a node, with optional filters.
   * Produces a D3.js/Cytoscape.js compatible JSON structure.
   */
  exportSubgraph(
    startId: string,
    maxDepth = 3,
    filters?: { quadrant?: QuadrantId; type?: MemoryType; minImportance?: number },
  ): GraphExport {
    // Get all reachable nodes via BFS
    let nodes = this.traverse(startId, maxDepth)

    // Apply filters
    if (filters) {
      if (filters.quadrant) {
        nodes = nodes.filter((n) => n.quadrant === filters.quadrant)
      }
      if (filters.type) {
        nodes = nodes.filter((n) => n.type === filters.type)
      }
      if (filters.minImportance !== undefined) {
        nodes = nodes.filter((n) => n.importance >= filters.minImportance!)
      }
    }

    // Collect all edges between the filtered node set
    const nodeIds = new Set(nodes.map((n) => n.id))
    const edges: GraphExport['edges'] = []

    if (nodeIds.size > 0) {
      const ids = [...nodeIds]
      const placeholders = ids.map(() => '?').join(', ')
      const edgeRows = this.db
        .prepare(
          `SELECT * FROM memory_edges
           WHERE source_memory_id IN (${placeholders})
             AND target_memory_id IN (${placeholders})`,
        )
        .all(...ids, ...ids) as EdgeRow[]

      for (const row of edgeRows) {
        edges.push({
          source: row.source_memory_id,
          target: row.target_memory_id,
          label: row.relationship_type,
          weight: row.weight,
        })
      }
    }

    return { nodes, edges }
  }
}
