import { NextResponse } from 'next/server'
import { authenticateRequest, getDb, getMemoryService } from '../auth'
import { MemoryIndex } from '@/lib/memory/memory-index'
import type { SearchQuery } from '@/lib/memory/models'

/**
 * POST /api/memory/search — Compound search with FTS + filters + semantic.
 * Body: SearchQuery
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const query = (await request.json()) as SearchQuery
    const db = getDb()
    const index = new MemoryIndex(db)

    // Use semantic search when semantic_query is provided
    if (query.semantic_query) {
      const service = getMemoryService()
      const config = service.getConfig()
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
