import { NextResponse } from 'next/server'
import { authenticateRequest, getMemoryService } from '../../memory/auth'
import { ObsidianClient } from '@/lib/obsidian/client'

/**
 * GET /api/obsidian/status — Check Obsidian connection status.
 * Returns { connected, authenticated, vault_folder, sync_direction }
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const service = getMemoryService()
  const config = service.getConfig()

  if (!config.obsidian_enabled) {
    return NextResponse.json({
      enabled: false,
      connected: false,
      message: 'Obsidian integration is disabled',
    })
  }

  // Temporarily allow self-signed certs
  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (config.obsidian_insecure_ssl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  try {
    const client = new ObsidianClient(config)
    const ping = await client.ping()

    return NextResponse.json({
      enabled: true,
      connected: ping.ok,
      authenticated: ping.authenticated ?? false,
      api_url: config.obsidian_api_url,
      vault_folder: config.obsidian_vault_folder,
      sync_direction: config.obsidian_sync_direction,
    })
  } catch (err) {
    return NextResponse.json({
      enabled: true,
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    if (config.obsidian_insecure_ssl) {
      if (prevTls !== undefined) process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls
      else delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    }
  }
}
