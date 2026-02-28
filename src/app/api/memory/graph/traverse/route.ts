import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../../auth'
import { MemoryGraph } from '@/lib/memory/graph'

interface TraverseRequest {
  start_id: string
  max_depth?: number
}

/**
 * POST /api/memory/graph/traverse — BFS traversal from a starting node.
 * Body: { start_id: string, max_depth?: number }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as TraverseRequest
    if (!body.start_id) {
      return NextResponse.json({ error: 'start_id is required' }, { status: 400 })
    }

    const db = getDb()
    const graph = new MemoryGraph(db)
    const nodes = graph.traverse(body.start_id, body.max_depth ?? 3)

    return NextResponse.json({ nodes })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
