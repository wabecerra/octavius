/**
 * POST /api/harness/evolve — Trigger the proposer agent manually
 *
 * Body (optional): { sinceDays?: number }
 */

import { NextResponse } from 'next/server'
import { runProposer } from '@/lib/harness/proposer'

export async function POST(request: Request) {
  let sinceDays = 1
  try {
    const body = await request.json()
    if (body.sinceDays && typeof body.sinceDays === 'number') {
      sinceDays = body.sinceDays
    }
  } catch {
    // Empty body is fine, use defaults
  }

  const run = await runProposer('manual', { sinceDays })

  return NextResponse.json({
    runId: run.runId,
    tracesAnalyzed: run.tracesAnalyzed,
    proposalsGenerated: run.proposalsGenerated,
    summary: run.summary,
    error: run.error,
  })
}
