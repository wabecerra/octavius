import { NextResponse } from 'next/server'
import { getService } from '../../service'

/** GET /api/llm-cost/costs/summary — Aggregated cost summary. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const start_time = searchParams.get('start_time')
  const end_time = searchParams.get('end_time')

  if (!start_time || !end_time) {
    return NextResponse.json(
      { error: 'start_time and end_time are required' },
      { status: 400 },
    )
  }

  const service = getService()
  const summary = service.getCostSummary({
    start_time,
    end_time,
    group_by: searchParams.has('group_by')
      ? searchParams.get('group_by')!.split(',')
      : ['model'],
    project_id: searchParams.get('project_id') ?? undefined,
    model: searchParams.get('model') ?? undefined,
  })

  return NextResponse.json(summary)
}
