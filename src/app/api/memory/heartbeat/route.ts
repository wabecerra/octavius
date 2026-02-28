import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../auth'
import { HeartbeatMonitor } from '@/lib/memory/heartbeat'

interface HeartbeatRequest {
  action: 'register' | 'heartbeat' | 'complete' | 'fail'
  process_id: string
  agent_id?: string
  interval_ms?: number
}

/**
 * GET /api/memory/heartbeat — Get status of all registered processes.
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const db = getDb()
  const monitor = new HeartbeatMonitor(db)

  // Also check for stalled processes
  const stalled = monitor.checkStalled()
  const all = monitor.listAll()

  return NextResponse.json({ processes: all, stalled_count: stalled.length })
}

/**
 * POST /api/memory/heartbeat — Register, heartbeat, complete, or fail a process.
 * Body: { action: 'register'|'heartbeat'|'complete'|'fail', process_id, agent_id?, interval_ms? }
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as HeartbeatRequest
    const db = getDb()
    const monitor = new HeartbeatMonitor(db)

    switch (body.action) {
      case 'register': {
        if (!body.agent_id || !body.interval_ms) {
          return NextResponse.json(
            { error: 'agent_id and interval_ms are required for register' },
            { status: 400 },
          )
        }
        const process = monitor.register(body.process_id, body.agent_id, body.interval_ms)
        return NextResponse.json(process, { status: 201 })
      }
      case 'heartbeat': {
        monitor.heartbeat(body.process_id)
        return NextResponse.json({ success: true })
      }
      case 'complete': {
        monitor.complete(body.process_id)
        return NextResponse.json({ success: true })
      }
      case 'fail': {
        monitor.fail(body.process_id)
        return NextResponse.json({ success: true })
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}` },
          { status: 400 },
        )
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
