import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../auth'
import { setContext, removeContext, listContexts } from '@/lib/memory/context-annotations'

/**
 * GET /api/memory/annotations — List all context annotations.
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const db = getDb()
  return NextResponse.json(listContexts(db))
}

/**
 * POST /api/memory/annotations — Create or update a context annotation.
 * Body: { path: string, description: string }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as { path?: string; description?: string }
    if (!body.path || !body.description) {
      return NextResponse.json(
        { error: 'path and description are required' },
        { status: 400 },
      )
    }

    const db = getDb()
    const annotation = setContext(db, body.path, body.description)
    return NextResponse.json(annotation, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * DELETE /api/memory/annotations — Remove a context annotation.
 * Body: { path: string }
 */
export async function DELETE(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as { path?: string }
    if (!body.path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }

    const db = getDb()
    const deleted = removeContext(db, body.path)
    if (!deleted) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
