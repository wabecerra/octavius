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
 * Returns the top-N most relevant memory items for a natural language query.
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
      limit: topN,
    }
    if (body.quadrant) {
      searchQuery.quadrant = body.quadrant
    }

    const db = getDb()
    const index = new MemoryIndex(db)

    // Try semantic search first if embeddings are enabled
    searchQuery.semantic_query = body.query
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
