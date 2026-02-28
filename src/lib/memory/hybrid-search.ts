import type Database from 'better-sqlite3'
import type { MemoryItem, MemoryConfig, SearchQuery, SearchResult } from './models'
import { computeEmbedding, findSimilar } from './embeddings'
import { getCachedResult, setCachedResult } from './search-cache'

/**
 * Reciprocal Rank Fusion (RRF) — merges ranked result lists into a single
 * scored list. Inspired by QMD's hybrid pipeline.
 *
 * score(doc) = Σ 1/(k + rank_i + 1) for each list where doc appears
 *
 * @param k - Smoothing constant (default 60, per QMD/standard RRF)
 */
export function reciprocalRankFusion(
  rankedLists: Array<Array<{ memoryId: string; score: number }>>,
  k = 60,
): Array<{ memoryId: string; score: number }> {
  const scores = new Map<string, number>()

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const { memoryId } = list[rank]
      const prev = scores.get(memoryId) ?? 0
      scores.set(memoryId, prev + 1 / (k + rank + 1))
    }
  }

  // Top-rank bonus: #1 in any list gets +0.05, #2-3 get +0.02
  for (const list of rankedLists) {
    if (list.length > 0) {
      const top1 = list[0].memoryId
      scores.set(top1, (scores.get(top1) ?? 0) + 0.05)
    }
    for (let i = 1; i < Math.min(3, list.length); i++) {
      const id = list[i].memoryId
      scores.set(id, (scores.get(id) ?? 0) + 0.02)
    }
  }

  return Array.from(scores.entries())
    .map(([memoryId, score]) => ({ memoryId, score }))
    .sort((a, b) => b.score - a.score)
}

/** Row shape from memory_items for FTS queries. */
interface FtsRow {
  memory_id: string
  rank: number
}

/** Row shape from memory_items. */
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

function sanitizeFtsQuery(text: string): string {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ')
}

/**
 * Build WHERE clause fragments for structured filters.
 * Returns [clauses, params] to be injected into SQL.
 */
function buildFilterClauses(query: SearchQuery): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []

  if (query.type) { clauses.push('m.type = ?'); params.push(query.type) }
  if (query.layer) { clauses.push('m.layer = ?'); params.push(query.layer) }
  if (query.source_type) { clauses.push('m.source_type = ?'); params.push(query.source_type) }
  if (query.agent_id) { clauses.push('m.agent_id = ?'); params.push(query.agent_id) }

  if (query.tags && query.tags.length > 0) {
    const tagConds = query.tags.map(() => 'm.tags LIKE ?')
    clauses.push(`(${tagConds.join(' OR ')})`)
    for (const tag of query.tags) params.push(`%${JSON.stringify(tag)}%`)
  }

  if (query.quadrant) {
    clauses.push('m.tags LIKE ?')
    params.push(`%"quadrant:${query.quadrant}"%`)
  }

  return { clauses, params }
}

/**
 * Run FTS5 search and return ranked results as [{memoryId, score}].
 * Score is negated FTS5 rank (higher = more relevant).
 */
function ftsRankedList(
  db: Database.Database,
  queryText: string,
  filters: { clauses: string[]; params: unknown[] },
  limit: number,
): Array<{ memoryId: string; score: number }> {
  const ftsQuery = sanitizeFtsQuery(queryText)
  if (!ftsQuery) return []

  const whereSQL = filters.clauses.length > 0 ? `AND ${filters.clauses.join(' AND ')}` : ''
  const sql = `
    SELECT m.memory_id, memory_fts.rank
    FROM memory_fts
    JOIN memory_items m ON memory_fts.rowid = m.rowid
    WHERE memory_fts MATCH ? ${whereSQL}
    ORDER BY memory_fts.rank
    LIMIT ?
  `
  const rows = db.prepare(sql).all(ftsQuery, ...filters.params, limit) as FtsRow[]
  return rows.map((r) => ({ memoryId: r.memory_id, score: -r.rank }))
}

/**
 * Run vector similarity search and return ranked results.
 */
async function vectorRankedList(
  db: Database.Database,
  queryText: string,
  config: MemoryConfig,
  limit: number,
): Promise<Array<{ memoryId: string; score: number }>> {
  if (!config.embedding_enabled) return []

  const embedding = await computeEmbedding(queryText, config)
  if (!embedding) return []

  return findSimilar(db, embedding, limit)
}

/**
 * Hybrid search: runs FTS5 + vector search in parallel, fuses with RRF,
 * then applies position-aware blending if reranking scores are available.
 *
 * This is the main entry point for QMD-inspired hybrid retrieval.
 */
export async function hybridSearch(
  db: Database.Database,
  query: SearchQuery,
  config: MemoryConfig,
): Promise<SearchResult> {
  const queryText = query.text ?? query.semantic_query ?? ''
  if (!queryText) {
    // No text query — fall back to filter-only listing
    return { items: [], total: 0 }
  }

  const limit = query.limit ?? 20
  const candidateLimit = limit * 3 // fetch more candidates for fusion
  const filters = buildFilterClauses(query)

  // Check cache first
  const cacheKey = `hybrid:${queryText}:${JSON.stringify(filters)}`
  const cached = getCachedResult(db, cacheKey)
  if (cached) return cached

  // Run FTS and vector search in parallel
  const [ftsResults, vectorResults] = await Promise.all([
    Promise.resolve(ftsRankedList(db, queryText, filters, candidateLimit)),
    vectorRankedList(db, queryText, config, candidateLimit),
  ])

  // If only one backend returned results, use it directly
  if (ftsResults.length === 0 && vectorResults.length === 0) {
    return { items: [], total: 0 }
  }

  // RRF fusion — original query results weighted via the lists
  const fused = reciprocalRankFusion([ftsResults, vectorResults])
  const topIds = fused.slice(0, limit).map((f) => f.memoryId)
  const fusedScoreMap = new Map(fused.map((f) => [f.memoryId, f.score]))

  if (topIds.length === 0) return { items: [], total: 0 }

  // Fetch full items
  const placeholders = topIds.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT m.* FROM memory_items m WHERE m.memory_id IN (${placeholders})`)
    .all(...topIds) as MemoryRow[]

  const itemMap = new Map(rows.map((r) => [r.memory_id, rowToMemoryItem(r)]))

  // Preserve fusion order
  const items: MemoryItem[] = []
  const scores: number[] = []
  for (const id of topIds) {
    const item = itemMap.get(id)
    if (item) {
      items.push(item)
      scores.push(fusedScoreMap.get(id) ?? 0)
    }
  }

  // Update last_accessed
  if (items.length > 0) {
    const now = new Date().toISOString()
    const accessIds = items.map((i) => i.memory_id)
    const accessPlaceholders = accessIds.map(() => '?').join(', ')
    db.prepare(`UPDATE memory_items SET last_accessed = ? WHERE memory_id IN (${accessPlaceholders})`)
      .run(now, ...accessIds)
    for (const item of items) item.last_accessed = now
  }

  const result: SearchResult = { items, total: items.length, relevance_scores: scores }

  // Cache the result
  setCachedResult(db, cacheKey, result)

  return result
}
