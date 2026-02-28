import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../../auth'
import { MemoryGraph } from '@/lib/memory/graph'
import type { MemoryEdge } from '@/lib/memory/models'

/**
 * GET /api/memory/graph/edges — Get edges by source, target, or type.
 * Query params: source_id, target_id, relationship_type
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const db = getDb()
  const graph = new MemoryGraph(db)

  const sourceId = searchParams.get('source_id')
  const targetId = searchParams.get('target_id')
  const relType = searchParams.get('relationship_type')

  let edges: MemoryEdge[] = []

  if (sourceId) {
    edges = graph.getOutgoing(sourceId)
  } else if (targetId) {
    edges = graph.getIncoming(targetId)
  } else if (relType) {
    edges = graph.getByType(relType)
  } else {
    // Return all edges (limited query)
    edges = graph.getByType('%') // fallback: empty if no type matches
  }

  return NextResponse.json({ edges })
}

/**
 * POST /api/memory/graph/edges — Create a new edge.
 * Body: { source_memory_id, target_memory_id, relationship_type, weight? }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as Omit<MemoryEdge, 'edge_id' | 'created_at'>
    const db = getDb()
    const graph = new MemoryGraph(db)
    const edge = graph.addEdge(body)
    return NextResponse.json(edge, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
