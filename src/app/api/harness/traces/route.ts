/**
 * GET /api/harness/traces — Query execution traces
 *
 * Query params:
 *   ?agentType=generalist
 *   ?outcome=failure
 *   ?since=2026-04-01T00:00:00Z
 *   ?limit=50&offset=0
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryTraces } from '@/lib/harness/trace-store'
import type { TraceOutcome } from '@/lib/harness/trace-types'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const { traces, total } = queryTraces({
    agentType: params.get('agentType') ?? undefined,
    outcome: (params.get('outcome') as TraceOutcome) ?? undefined,
    since: params.get('since') ?? undefined,
    until: params.get('until') ?? undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : 50,
    offset: params.get('offset') ? Number(params.get('offset')) : 0,
  })

  return NextResponse.json({ traces, total })
}
