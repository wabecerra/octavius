import { NextResponse } from 'next/server'
import { authenticateRequest, getMemoryService, getDb } from '../../memory/auth'
import { ObsidianClient } from '@/lib/obsidian/client'
import { pushToVault, pullFromVault, stampPulledNote } from '@/lib/obsidian/sync'
import { MemoryIndex } from '@/lib/memory/memory-index'

/**
 * POST /api/obsidian/sync — Run a sync between Octavius memory and Obsidian vault.
 * Body: { direction?: 'push' | 'pull' | 'bidirectional' }
 *
 * Returns: { pushed, pulled, errors }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const service = getMemoryService()
  const config = service.getConfig()

  if (!config.obsidian_enabled) {
    return NextResponse.json({ error: 'Obsidian integration is disabled' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({})) as { direction?: string }
  const direction = body.direction ?? config.obsidian_sync_direction ?? 'bidirectional'

  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (config.obsidian_insecure_ssl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  try {
    const client = new ObsidianClient(config)
    let pushed = 0
    let pulled = 0
    const errors: string[] = []

    // Push: memory → vault
    if (direction === 'push' || direction === 'bidirectional' || direction === 'push_only') {
      const db = getDb()
      const index = new MemoryIndex(db)
      const result = index.search({ limit: 500 })
      const pushResult = await pushToVault(client, result.items, config.obsidian_vault_folder)
      pushed = pushResult.pushed
      errors.push(...pushResult.errors)
    }

    // Pull: vault → memory
    if (direction === 'pull' || direction === 'bidirectional' || direction === 'pull_only') {
      const pullResult = await pullFromVault(client, config.obsidian_vault_folder)
      for (const item of pullResult.items) {
        try {
          const created = service.create(item)
          pulled++
          // Stamp the vault note with the new memory_id to prevent re-pulling
          await stampPulledNote(client, item._vaultPath, created.memory_id)
        } catch (err) {
          errors.push(`Failed to create memory: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      errors.push(...pullResult.errors)
    }

    return NextResponse.json({ pushed, pulled, errors })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  } finally {
    if (config.obsidian_insecure_ssl) {
      if (prevTls !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls
      else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    }
  }
}
