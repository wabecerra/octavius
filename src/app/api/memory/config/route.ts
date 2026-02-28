import { NextResponse } from 'next/server'
import { authenticateRequest, getMemoryService } from '../auth'
import type { MemoryConfig } from '@/lib/memory/models'

/**
 * GET /api/memory/config — Get current memory configuration.
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const service = getMemoryService()
  const config = service.getConfig()
  return NextResponse.json(config)
}

/**
 * PUT /api/memory/config — Update memory configuration.
 * Body: Partial<MemoryConfig>
 */
export async function PUT(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const updates = (await request.json()) as Partial<MemoryConfig>
    const service = getMemoryService()
    const config = service.updateConfig(updates)
    return NextResponse.json(config)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
