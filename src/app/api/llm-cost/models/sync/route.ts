import { NextResponse } from 'next/server'
import { getService } from '../../service'

/** POST /api/llm-cost/models/sync — Trigger LiteLLM sync. */
export async function POST() {
  try {
    const service = getService()
    const result = await service.getRegistry().syncFromLiteLLM()

    return NextResponse.json({
      status: 'completed',
      synced: result.synced,
      errors: result.errors,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
