import { NextResponse } from 'next/server'
import { LcmBridgeClient } from '@/lib/lcm/client'

/**
 * POST /api/lcm/search — Cross-search LCM conversation history.
 * Body: { query: string, limit?: number }
 * Returns matching messages and summaries from the LCM DAG.
 */
export async function POST(request: Request) {
  const client = new LcmBridgeClient()
  try {
    const body = await request.json()
    const { query, limit } = body as { query?: string; limit?: number }

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const results = client.search(query, limit ?? 20)
    return NextResponse.json({ results, total: results.length })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    )
  } finally {
    client.close()
  }
}
