import { NextResponse } from 'next/server'
import { LcmBridgeClient } from '@/lib/lcm/client'

/**
 * GET /api/lcm/conversations — List LCM conversations.
 * GET /api/lcm/conversations?id=123 — Get conversation detail.
 */
export async function GET(request: Request) {
  const client = new LcmBridgeClient()
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (id) {
      const detail = client.getConversationDetail(Number(id))
      if (!detail) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      return NextResponse.json(detail)
    }

    const conversations = client.listConversations()
    return NextResponse.json({ conversations })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list conversations' },
      { status: 500 },
    )
  } finally {
    client.close()
  }
}
