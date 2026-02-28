import { NextResponse } from 'next/server'
import { authenticateRequest, getMemoryService, getDb } from '../auth'
import { MemoryIndex } from '@/lib/memory/memory-index'
import type { SearchQuery, CreateMemoryItemInput } from '@/lib/memory/models'

/**
 * GET /api/memory/items — List/search memory items with optional filters.
 * Query params: text, type, layer, quadrant, tags (comma-separated), source_type, agent_id, limit, offset
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)

  const query: SearchQuery = {}
  if (searchParams.has('text')) query.text = searchParams.get('text')!
  if (searchParams.has('type')) query.type = searchParams.get('type') as SearchQuery['type']
  if (searchParams.has('layer')) query.layer = searchParams.get('layer') as SearchQuery['layer']
  if (searchParams.has('quadrant')) query.quadrant = searchParams.get('quadrant') as SearchQuery['quadrant']
  if (searchParams.has('tags')) query.tags = searchParams.get('tags')!.split(',')
  if (searchParams.has('source_type')) query.source_type = searchParams.get('source_type') as SearchQuery['source_type']
  if (searchParams.has('agent_id')) query.agent_id = searchParams.get('agent_id')!
  if (searchParams.has('limit')) query.limit = Number(searchParams.get('limit'))
  if (searchParams.has('offset')) query.offset = Number(searchParams.get('offset'))

  const db = getDb()
  const index = new MemoryIndex(db)
  const result = index.search(query)

  return NextResponse.json(result)
}

/**
 * POST /api/memory/items — Create a new memory item.
 * Body: CreateMemoryItemInput
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as CreateMemoryItemInput
    const service = getMemoryService()
    const item = service.create(body)

    // Fire-and-forget: compute and store embedding if enabled (graceful fallback)
    service.computeAndStoreEmbeddingForItem(item.memory_id, item.text).catch(() => {})

    return NextResponse.json(item, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
