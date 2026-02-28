import { NextResponse } from 'next/server'
import { authenticateRequest, getDb, getMemoryService } from '../auth'
import { MemoryIndex } from '@/lib/memory/memory-index'
import type { SearchQuery } from '@/lib/memory/models'

/**
 * POST /api/memory/search — Compound search with hybrid RRF fusion.
 *
 * When embedding_enabled is true, uses the full hybrid pipeline:
 *   1. Query expansion (generates alternative phrasings)
 *   2. FTS5 + vector search fused via Reciprocal Rank Fusion
 *   3. LLM re-ranking with position-aware blending
 *   4. Context annotations attached to results
 *
 * Falls back to FTS-only or semantic-only search when features are disabled.
 *
 * Body: SearchQuery (text, semantic_query, type, layer, quadrant, tags, etc.)
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const query = (await request.json()) as SearchQuery
    const service = getMemoryService()
    const config = service.getConfig()

    // Use hybrid search when embeddings are enabled and there's a text query
    if (config.embedding_enabled && (query.text || query.semantic_query)) {
      const result = await service.searchHybrid(query)
      return NextResponse.json(result)
    }

    // Fallback: FTS-only or semantic-only via MemoryIndex
    const db = getDb()
    const index = new MemoryIndex(db)

    if (query.semantic_query) {
      const result = await index.searchWithSemantics(query, config)
      return NextResponse.json(result)
    }

    const result = index.search(query)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
