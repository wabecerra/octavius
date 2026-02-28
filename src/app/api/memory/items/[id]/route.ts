import { NextResponse } from 'next/server'
import { authenticateRequest, getMemoryService } from '../../auth'
import type { MemoryItem } from '@/lib/memory/models'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/memory/items/[id] — Get a single memory item by ID.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const { id } = await params
  const service = getMemoryService()
  const item = service.getById(id)

  if (!item) {
    return NextResponse.json({ error: 'Memory item not found' }, { status: 404 })
  }

  return NextResponse.json(item)
}

/**
 * PUT /api/memory/items/[id] — Update a memory item.
 * Body: Partial<MemoryItem>
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const { id } = await params

  try {
    const updates = (await request.json()) as Partial<MemoryItem>
    const service = getMemoryService()
    const item = service.update(id, updates)
    return NextResponse.json(item)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/memory/items/[id] — Delete a memory item.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const { id } = await params
  const service = getMemoryService()
  const deleted = service.delete(id)

  if (!deleted) {
    return NextResponse.json({ error: 'Memory item not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
