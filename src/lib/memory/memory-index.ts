import type Database from 'better-sqlite3'
import type { MemoryItem, MemoryConfig, SearchQuery, SearchResult } from './models'
import { computeEmbedding, findSimilar } from './embeddings'

/** Row shape returned by better-sqlite3 for memory_items queries. */
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
  tags: string
  embedding_ref: string | null
  consolidated_into: string | null
  archived: number
}

/** Row shape when joining with FTS5 rank. */
interface FtsRow extends MemoryRow {
  rank: number
}

/** Convert a flat SQLite row into a MemoryItem. */
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
 * Sanitize user input for FTS5 MATCH queries.
 * Wraps each token in double quotes to prevent FTS5 syntax errors from
 * special characters (e.g. colons, hyphens, parentheses).
 */
function sanitizeFtsQuery(text: string): string {
  // Split on whitespace, filter empty tokens, wrap each in double quotes
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) return ''

  // Quote each token and join with OR for better recall
  // (AND was too strict — "business plan" would fail if "plan" wasn't in any item)
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ')
}

/**
 * MemoryIndex provides advanced search over memory items using FTS5 full-text
 * search combined with structured filters (type, layer, tags, quadrant,
 * provenance). All filters combine with AND semantics.
 */
export class MemoryIndex {
  constructor(private readonly db: Database.Database) {}

  /**
   * Search memory items with optional full-text query and structured filters.
   *
   * - If `query.text` is provided, uses FTS5 MATCH on memory_fts, joined with
   *   memory_items for full row data and relevance scores (rank).
   * - Applies WHERE filters for type, layer, source_type, agent_id.
   * - For tags: checks if any filter tag appears in the item's tags JSON.
   * - For quadrant: checks tags contain 'quadrant:{quadrantId}'.
   * - All filters combine with AND semantics.
   * - Updates last_accessed on all returned items.
   * - Returns SearchResult with items, total, and optional relevance_scores.
   */
  search(query: SearchQuery): SearchResult {
    const whereClauses: string[] = []
    const params: unknown[] = []
    let useFts = false
    let ftsQuery = ''

    // FTS5 full-text search
    if (query.text) {
      ftsQuery = sanitizeFtsQuery(query.text)
      if (ftsQuery.length > 0) {
        useFts = true
      }
    }

    // Structured filters
    if (query.type) {
      whereClauses.push('m.type = ?')
      params.push(query.type)
    }

    if (query.layer) {
      whereClauses.push('m.layer = ?')
      params.push(query.layer)
    }

    if (query.source_type) {
      whereClauses.push('m.source_type = ?')
      params.push(query.source_type)
    }

    if (query.agent_id) {
      whereClauses.push('m.agent_id = ?')
      params.push(query.agent_id)
    }

    // Tags filter: check if any of the filter tags appear in the item's tags JSON
    // Use quoted form to avoid substring matches (e.g. "bu" should not match "buiollxrgiaw")
    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(() => 'm.tags LIKE ?')
      whereClauses.push(`(${tagConditions.join(' OR ')})`)
      for (const tag of query.tags) {
        params.push(`%${JSON.stringify(tag)}%`)
      }
    }

    // Quadrant filter: check tags contain 'quadrant:{quadrantId}'
    if (query.quadrant) {
      whereClauses.push('m.tags LIKE ?')
      params.push(`%"quadrant:${query.quadrant}"%`)
    }

    const limit = query.limit ?? 20
    const offset = query.offset ?? 0

    let items: MemoryItem[]
    let total: number
    let relevanceScores: number[] | undefined

    if (useFts) {
      // FTS5 path: JOIN memory_fts with memory_items via rowid
      const ftsMatchClause = 'memory_fts MATCH ?'
      const ftsParams = [ftsQuery]

      const whereSQL =
        whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : ''

      // Count query
      const countSql = `
        SELECT COUNT(*) as total
        FROM memory_fts
        JOIN memory_items m ON memory_fts.rowid = m.rowid
        WHERE ${ftsMatchClause} ${whereSQL}
      `
      const countRow = this.db
        .prepare(countSql)
        .get(...ftsParams, ...params) as { total: number }
      total = countRow.total

      // Data query with rank for relevance scoring
      const dataSql = `
        SELECT m.*, memory_fts.rank
        FROM memory_fts
        JOIN memory_items m ON memory_fts.rowid = m.rowid
        WHERE ${ftsMatchClause} ${whereSQL}
        ORDER BY memory_fts.rank
        LIMIT ? OFFSET ?
      `
      const rows = this.db
        .prepare(dataSql)
        .all(...ftsParams, ...params, limit, offset) as FtsRow[]

      items = rows.map(rowToMemoryItem)
      // FTS5 rank is negative (more negative = more relevant), negate for scores
      relevanceScores = rows.map((r) => -r.rank)
    } else {
      // Non-FTS path: direct query on memory_items
      const whereSQL =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

      const countSql = `SELECT COUNT(*) as total FROM memory_items m ${whereSQL}`
      const countRow = this.db
        .prepare(countSql)
        .get(...params) as { total: number }
      total = countRow.total

      const dataSql = `
        SELECT m.*
        FROM memory_items m
        ${whereSQL}
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `
      const rows = this.db
        .prepare(dataSql)
        .all(...params, limit, offset) as MemoryRow[]

      items = rows.map(rowToMemoryItem)
    }

    // Update last_accessed on all returned items
    if (items.length > 0) {
      const now = new Date().toISOString()
      const ids = items.map((i) => i.memory_id)
      const placeholders = ids.map(() => '?').join(', ')
      this.db
        .prepare(
          `UPDATE memory_items SET last_accessed = ? WHERE memory_id IN (${placeholders})`,
        )
        .run(now, ...ids)

      for (const item of items) {
        item.last_accessed = now
      }
    }

    const result: SearchResult = { items, total }
    if (relevanceScores) {
      result.relevance_scores = relevanceScores
    }
    return result
  }


    /**
     * Async search that adds semantic similarity when embeddings are available.
     * Falls back to standard FTS + filter search when embeddings are disabled or unavailable.
     */
    async searchWithSemantics(query: SearchQuery, config: MemoryConfig): Promise<SearchResult> {
      // If no semantic_query or embeddings disabled, fall back to standard search
      if (!query.semantic_query || !config.embedding_enabled) {
        return this.search(query)
      }

      // Compute query embedding
      const queryEmbedding = await computeEmbedding(query.semantic_query, config)
      if (!queryEmbedding) {
        // Embedding failed — fall back to standard search
        return this.search(query)
      }

      // Find similar items by embedding
      const limit = query.limit ?? 20
      const similar = findSimilar(this.db, queryEmbedding, limit * 2)

      if (similar.length === 0) {
        return this.search(query)
      }

      // Fetch full items for the similar IDs and apply filters
      const ids = similar.map((s) => s.memoryId)
      const placeholders = ids.map(() => '?').join(', ')
      const whereClauses: string[] = [`m.memory_id IN (${placeholders})`]
      const params: unknown[] = [...ids]

      if (query.type) {
        whereClauses.push('m.type = ?')
        params.push(query.type)
      }
      if (query.layer) {
        whereClauses.push('m.layer = ?')
        params.push(query.layer)
      }
      if (query.quadrant) {
        whereClauses.push('m.tags LIKE ?')
        params.push(`%"quadrant:${query.quadrant}"%`)
      }

      const sql = `
        SELECT m.* FROM memory_items m
        WHERE ${whereClauses.join(' AND ')}
      `
      const rows = this.db.prepare(sql).all(...params) as MemoryRow[]
      const itemMap = new Map(rows.map((r) => [r.memory_id, rowToMemoryItem(r)]))

      // Order by similarity score, filter to items that passed filters
      const items: MemoryItem[] = []
      const scores: number[] = []
      for (const s of similar) {
        const item = itemMap.get(s.memoryId)
        if (item) {
          items.push(item)
          scores.push(s.score)
          if (items.length >= limit) break
        }
      }

      // Update last_accessed
      if (items.length > 0) {
        const now = new Date().toISOString()
        const accessIds = items.map((i) => i.memory_id)
        const accessPlaceholders = accessIds.map(() => '?').join(', ')
        this.db
          .prepare(`UPDATE memory_items SET last_accessed = ? WHERE memory_id IN (${accessPlaceholders})`)
          .run(now, ...accessIds)
        for (const item of items) {
          item.last_accessed = now
        }
      }

      return { items, total: items.length, relevance_scores: scores }
    }

}
