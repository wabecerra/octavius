import { NextResponse } from 'next/server'
import { getService } from '../service'
import type { CreateLogInput } from '@/lib/llm-cost'

/** POST /api/llm-cost/logs — Ingest a single LLM log record. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateLogInput
    const service = getService()
    const record = service.ingest(body)
    return NextResponse.json({ id: record.id, status: 'accepted' }, { status: 202 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** GET /api/llm-cost/logs — Query logs with filters. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const service = getService()

  const result = service.queryLogs({
    start_time: searchParams.get('start_time') ?? undefined,
    end_time: searchParams.get('end_time') ?? undefined,
    model: searchParams.get('model') ?? undefined,
    provider: searchParams.get('provider') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    project_id: searchParams.get('project_id') ?? undefined,
    agent_id: searchParams.get('agent_id') ?? undefined,
    trace_id: searchParams.get('trace_id') ?? undefined,
    min_cost_usd: searchParams.has('min_cost_usd')
      ? Number(searchParams.get('min_cost_usd'))
      : undefined,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : 100,
    offset: searchParams.has('offset') ? Number(searchParams.get('offset')) : 0,
    sort_by: (searchParams.get('sort_by') as 'timestamp' | 'cost' | 'latency' | 'tokens') ?? 'timestamp',
    sort_order: (searchParams.get('sort_order') as 'asc' | 'desc') ?? 'desc',
  })

  return NextResponse.json({
    data: result.data,
    pagination: {
      total: result.total,
      limit: Number(searchParams.get('limit') ?? 100),
      offset: Number(searchParams.get('offset') ?? 0),
      has_more: result.total > (Number(searchParams.get('offset') ?? 0) + Number(searchParams.get('limit') ?? 100)),
    },
  })
}
