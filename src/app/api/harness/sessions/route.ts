/**
 * GET /api/harness/sessions — List active harness sessions
 * GET /api/harness/sessions?key=<sessionKey> — Get specific session
 */

import { NextRequest, NextResponse } from 'next/server'
import { getActiveSessions, getHarnessSession } from '@/lib/harness/session-manager'
import { PERMISSION_LABELS } from '@/lib/harness/types'

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')

  if (key) {
    const session = getHarnessSession(key)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({
      ...session,
      permissionLabel: PERMISSION_LABELS[session.permissionLevel],
      tokenPct: session.tokenBudget > 0
        ? Math.round((session.tokenUsed / session.tokenBudget) * 100)
        : 0,
    })
  }

  const sessions = getActiveSessions().map(s => ({
    ...s,
    permissionLabel: PERMISSION_LABELS[s.permissionLevel],
    tokenPct: s.tokenBudget > 0 ? Math.round((s.tokenUsed / s.tokenBudget) * 100) : 0,
  }))

  return NextResponse.json({ sessions, count: sessions.length })
}
