import { NextResponse } from 'next/server'
import { authenticateRequest, getDb, getMemoryService } from '../auth'
import { MemoryIndex } from '@/lib/memory/memory-index'
import type { SearchQuery, QuadrantId } from '@/lib/memory/models'

interface ContextRequest {
  query: string
  quadrant?: QuadrantId
  top_n?: number
}

/**
 * POST /api/memory/context — Context retrieval for agent prompt injection.
 *
 * Returns the top-N most relevant memory items for a natural language query,
 * using the full hybrid search pipeline when available:
 *   - Query expansion → FTS + vector → RRF fusion → LLM re-ranking
 *   - Context annotations included so agents understand what each memory is
 *
 * Body: { query: string, quadrant?: QuadrantId, top_n?: number }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as ContextRequest
    if (!body.query) {
      return NextResponse.json({ error: 'query field is required' }, { status: 400 })
    }

    const service = getMemoryService()
    const config = service.getConfig()
    const topN = body.top_n ?? config.context_retrieval_top_n

    const searchQuery: SearchQuery = {
      text: body.query,
      semantic_query: body.query,
      limit: topN,
    }
    if (body.quadrant) {
      searchQuery.quadrant = body.quadrant
    }

    // Use hybrid search when embeddings are enabled
    if (config.embedding_enabled) {
      const result = await service.searchHybrid(searchQuery)
      return NextResponse.json({
        items: result.items,
        total: result.total,
        relevance_scores: result.relevance_scores,
        contexts: result.contexts,
      })
    }

    // Fallback: FTS + semantic via MemoryIndex
    const db = getDb()
    const index = new MemoryIndex(db)
    const result = await index.searchWithSemantics(searchQuery, config)

    return NextResponse.json({
      items: result.items,
      total: result.total,
      relevance_scores: result.relevance_scores,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
