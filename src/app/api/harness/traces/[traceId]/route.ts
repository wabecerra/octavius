/**
 * GET /api/harness/traces/:traceId — Get a single execution trace
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTrace } from '@/lib/harness/trace-store'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await params
  const trace = getTrace(traceId)
  if (!trace) {
    return NextResponse.json({ error: 'Trace not found' }, { status: 404 })
  }
  return NextResponse.json(trace)
}
