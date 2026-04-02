/**
 * GET /api/harness/policies/:policyId — Get policy detail
 * PATCH /api/harness/policies/:policyId — Transition policy status
 *
 * PATCH body: { action: 'stage' | 'activate' | 'reject' | 'rollback' }
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getPolicy,
  stagePolicy,
  activatePolicy,
  rejectPolicy,
  rollbackPolicy,
} from '@/lib/harness/policy-store'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ policyId: string }> },
) {
  const { policyId } = await params
  const policy = getPolicy(policyId)
  if (!policy) {
    return NextResponse.json({ error: 'Policy not found' }, { status: 404 })
  }
  return NextResponse.json(policy)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ policyId: string }> },
) {
  const { policyId } = await params
  const body = await request.json()
  const { action } = body

  const actions: Record<string, (id: string) => boolean> = {
    stage: stagePolicy,
    activate: activatePolicy,
    reject: rejectPolicy,
    rollback: rollbackPolicy,
  }

  const fn = actions[action]
  if (!fn) {
    return NextResponse.json(
      { error: `Invalid action: ${action}. Must be: stage, activate, reject, rollback` },
      { status: 400 },
    )
  }

  const success = fn(policyId)
  if (!success) {
    return NextResponse.json(
      { error: `Transition failed. Policy may not exist or may not be in the correct state.` },
      { status: 409 },
    )
  }

  const updated = getPolicy(policyId)
  return NextResponse.json(updated)
}
