import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { importLCMConversations, hasLCM } from '@/lib/integrations/lcm-sync'
import { MemoryService } from '@/lib/memory/service'

/**
 * POST /api/integrations/lcm/import — Trigger LCM → Octavius import
 * 
 * Body: { days?: number; limit?: number }
 * Returns: { imported: number; skipped: number; errors: number }
 */
export async function POST(request: Request) {
  try {
    if (!hasLCM()) {
      return NextResponse.json(
        { error: 'LCM database not found at ~/.openclaw/lcm.db' },
        { status: 404 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as { days?: number; limit?: number }
    const db = getDatabase()
    const memoryService = new MemoryService(db)

    const result = importLCMConversations(memoryService, body)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/integrations/lcm/status — Check LCM integration status
 */
export async function GET() {
  const has = hasLCM()
  return NextResponse.json({
    lcm_detected: has,
    lcm_path: '~/.openclaw/lcm.db',
    auto_import_enabled: has,
  })
}
