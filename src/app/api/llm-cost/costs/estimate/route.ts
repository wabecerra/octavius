import { NextResponse } from 'next/server'
import { getService } from '../../service'
import { estimateCost } from '@/lib/llm-cost'
import { getDatabase } from '@/lib/memory/db'

/** POST /api/llm-cost/costs/estimate — Estimate cost before an LLM call. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      model: string
      input_tokens: number
      estimated_output_tokens?: number
    }

    if (!body.model || body.input_tokens == null) {
      return NextResponse.json(
        { error: 'model and input_tokens are required' },
        { status: 400 },
      )
    }

    const service = getService()
    const db = getDatabase()
    const estimate = estimateCost(
      service.getRegistry(),
      body.model,
      body.input_tokens,
      body.estimated_output_tokens,
      db,
    )

    return NextResponse.json(estimate)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
