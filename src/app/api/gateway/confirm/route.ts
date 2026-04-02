/**
 * POST /api/gateway/confirm — Confirm or reject a pending critical operation
 *
 * Body: { confirmationId: string, action: 'confirm' | 'reject' }
 *
 * GET /api/gateway/confirm — List pending confirmations
 */

import { NextResponse } from 'next/server'
import {
  confirmOperation,
  rejectConfirmation,
  getPendingConfirmations,
  cleanExpired,
} from '@/lib/gateway/confirmation-gate'

export async function GET() {
  cleanExpired()
  return NextResponse.json({ pending: getPendingConfirmations() })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { confirmationId, action } = body

  if (!confirmationId || !action) {
    return NextResponse.json(
      { error: 'confirmationId and action are required' },
      { status: 400 },
    )
  }

  if (action === 'confirm') {
    const result = confirmOperation(confirmationId)
    if (!result.confirmed) {
      return NextResponse.json(
        { error: 'Confirmation expired or not found' },
        { status: 410 },
      )
    }
    return NextResponse.json({
      confirmed: true,
      operation: result.operation,
      params: result.params,
    })
  }

  if (action === 'reject') {
    const removed = rejectConfirmation(confirmationId)
    return NextResponse.json({ rejected: removed })
  }

  return NextResponse.json({ error: 'action must be confirm or reject' }, { status: 400 })
}
