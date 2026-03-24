import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { exportToObsidian, findObsidianVault } from '@/lib/integrations/obsidian-sync'
import { MemoryService } from '@/lib/memory/service'

/**
 * POST /api/integrations/obsidian/export — Trigger Octavius → Obsidian export
 * 
 * Body: { days?: number; types?: string[] }
 * Returns: { exported: number; skipped: number; errors: number }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { days?: number; types?: string[] }
    const db = getDatabase()
    const memoryService = new MemoryService(db)

    const result = exportToObsidian(memoryService, body)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/integrations/obsidian/status — Check Obsidian integration status
 */
export async function GET() {
  const vaultPath = findObsidianVault()
  return NextResponse.json({
    obsidian_detected: vaultPath !== null,
    vault_path: vaultPath,
    auto_export_enabled: vaultPath !== null,
  })
}
