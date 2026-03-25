import { NextResponse } from 'next/server'
import { authenticateRequest, getMemoryService } from '../../memory/auth'
import { ObsidianClient } from '@/lib/obsidian/client'
import { buildVaultGraph } from '@/lib/obsidian/sync'
import type { ObsidianGraphExport } from '@/lib/memory/models'

/**
 * GET /api/obsidian/graph — Build and return the Obsidian vault knowledge graph.
 * Query params: folder (optional, defaults to '/' for full vault)
 *
 * Returns: ObsidianGraphExport { nodes, edges }
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const service = getMemoryService()
  const config = service.getConfig()

  if (!config.obsidian_enabled) {
    return NextResponse.json({ error: 'Obsidian integration is disabled' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const folder = searchParams.get('folder') ?? '/'

  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (config.obsidian_insecure_ssl) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }

  try {
    const client = new ObsidianClient(config)
    const { nodes, edges } = await buildVaultGraph(client, folder)

    const graphExport: ObsidianGraphExport = {
      nodes: Array.from(nodes.entries()).map(([name, data]) => ({
        id: name,
        label: name,
        path: data.path,
        isMemorySynced: !!data.memoryId,
        memoryId: data.memoryId,
        linkCount: data.linkCount,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: 'wikilink',
      })),
    }

    return NextResponse.json(graphExport)
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
