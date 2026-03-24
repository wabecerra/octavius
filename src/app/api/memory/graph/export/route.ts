import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../../auth'
import { MemoryGraph } from '@/lib/memory/graph'
import type { MemoryType, QuadrantId } from '@/lib/memory/models'

interface ExportRequest {
  start_id?: string
  max_depth?: number
  filters?: {
    quadrant?: QuadrantId
    type?: MemoryType
    minImportance?: number
  }
}

/**
 * POST /api/memory/graph/export — Export a subgraph for visualization.
 * Body: { start_id?: string, max_depth?: number, filters?: { quadrant?, type?, minImportance? } }
 * 
 * If start_id is not provided, uses most recent memory as starting point.
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as ExportRequest
    const db = getDb()
    const graph = new MemoryGraph(db)
    
    // If no start_id provided, use most recent memory
    let startId = body.start_id
    if (!startId) {
      const recent = db.prepare(
        'SELECT memory_id FROM memory_items ORDER BY created_at DESC LIMIT 1'
      ).get() as { memory_id?: string }
      
      if (!recent?.memory_id) {
        return NextResponse.json({ 
          nodes: [], 
          links: [],
          message: 'No memories in system' 
        })
      }
      startId = recent.memory_id
    }
    
    const exported = graph.exportSubgraph(
      startId,
      body.max_depth ?? 2,
      body.filters,
    )

    return NextResponse.json(exported)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
