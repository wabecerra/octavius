/**
 * GET /api/harness/permissions — Get permission defaults and pending elevations
 */

import { NextResponse } from 'next/server'
import { AGENT_DEFAULT_PERMISSIONS, getPendingElevations, cleanExpiredElevations } from '@/lib/harness/permissions'
import { PERMISSION_LABELS } from '@/lib/harness/types'

export async function GET() {
  cleanExpiredElevations()

  const defaults = Object.entries(AGENT_DEFAULT_PERMISSIONS).map(([type, level]) => ({
    agentType: type,
    level,
    label: PERMISSION_LABELS[level],
  }))

  return NextResponse.json({
    defaults,
    pendingElevations: getPendingElevations(),
  })
}
