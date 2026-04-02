/**
 * GET /api/harness/policies — List policies
 * POST /api/harness/policies — Create a manual policy
 */

import { NextRequest, NextResponse } from 'next/server'
import { listPolicies, createPolicy } from '@/lib/harness/policy-store'
import type { PolicyType, PolicyStatus } from '@/lib/harness/trace-types'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const policies = listPolicies({
    policyType: (params.get('type') as PolicyType) ?? undefined,
    status: (params.get('status') as PolicyStatus) ?? undefined,
    target: params.get('target') ?? undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : 50,
  })
  return NextResponse.json({ policies })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { policyType, target, payload, reason, evidence } = body

  if (!policyType || !target || !payload || !reason) {
    return NextResponse.json(
      { error: 'policyType, target, payload, and reason are required' },
      { status: 400 },
    )
  }

  const policy = createPolicy({
    policyType,
    target,
    payload,
    reason,
    evidence: evidence ?? [],
  })

  return NextResponse.json(policy, { status: 201 })
}
