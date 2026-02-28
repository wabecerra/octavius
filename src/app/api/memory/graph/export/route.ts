import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../../auth'
import { MemoryGraph } from '@/lib/memory/graph'
import type { MemoryType, QuadrantId } from '@/lib/memory/models'

interface ExportRequest {
  start_id: string
  max_depth?: number
  filters?: {
    quadrant?: QuadrantId
    type?: MemoryType
    minImportance?: number
  }
}

/**
 * POST /api/memory/graph/export — Export a subgraph for visualization.
 * Body: { start_id: string, max_depth?: number, filters?: { quadrant?, type?, minImportance? } }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as ExportRequest
    if (!body.start_id) {
      return NextResponse.json({ error: 'start_id is required' }, { status: 400 })
    }

    const db = getDb()
    const graph = new MemoryGraph(db)
    const exported = graph.exportSubgraph(
      body.start_id,
      body.max_depth ?? 3,
      body.filters,
    )

    return NextResponse.json(exported)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
