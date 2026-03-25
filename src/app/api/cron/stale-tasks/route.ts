import { NextResponse } from 'next/server'

/**
 * GET /api/cron/stale-tasks — Cron endpoint to auto-revert stale tasks
 *
 * Intended to be called periodically (e.g., every hour via OpenClaw cron
 * or external scheduler). Reverts in-progress tasks that have had no
 * agent activity for 48+ hours back to backlog.
 *
 * Query params:
 *   ?staleHours=48 — threshold (default 48)
 *   ?action=revert-to-backlog — what to do (default revert-to-backlog)
 *   ?secret=xxx — optional auth token (matches OCTAVIUS_API_SECRET)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const expectedSecret = process.env.OCTAVIUS_API_SECRET

  // Simple auth check if secret is configured
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const staleHours = Number(searchParams.get('staleHours') ?? 48)
  const action = searchParams.get('action') || 'revert-to-backlog'
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'

  try {
    const res = await fetch(`${baseUrl}/api/dashboard/tasks/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, staleHours }),
    })

    const data = await res.json()
    console.log(`[cron/stale-tasks] Reconciled ${data.affected} stale tasks (>${staleHours}h, action=${action})`)

    return NextResponse.json({
      ok: true,
      ...data,
      staleHours,
      action,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/stale-tasks] Failed:', err)
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'unknown',
    }, { status: 500 })
  }
}
