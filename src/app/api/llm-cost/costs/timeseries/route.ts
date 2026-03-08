import { NextResponse } from 'next/server'
import { getService } from '../../service'

/** GET /api/llm-cost/costs/timeseries — Cost data over time. */
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
  const timeseries = service.getCostTimeseries({
    start_time,
    end_time,
    granularity: (searchParams.get('granularity') as 'hour' | 'day' | 'week' | 'month') ?? 'hour',
    project_id: searchParams.get('project_id') ?? undefined,
  })

  return NextResponse.json(timeseries)
}
