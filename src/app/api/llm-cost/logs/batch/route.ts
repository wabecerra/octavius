import { NextResponse } from 'next/server'
import { getService } from '../../service'
import type { CreateLogInput } from '@/lib/llm-cost'

/** POST /api/llm-cost/logs/batch — Ingest multiple LLM log records. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { records: CreateLogInput[] }
    if (!Array.isArray(body.records)) {
      return NextResponse.json({ error: 'records must be an array' }, { status: 400 })
    }
    if (body.records.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 records per batch' }, { status: 400 })
    }

    const service = getService()
    const result = service.ingestBatch(body.records)

    return NextResponse.json(
      { accepted_count: result.accepted, failed_count: result.failed },
      { status: 202 },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
