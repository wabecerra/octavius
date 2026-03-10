import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

export interface HeartbeatRun {
  id: number
  timestamp: string
  summary: string
  taskCount: number
  model: string | null
  costUsd: number
  actionable: boolean
  checksRun: string[]
}

/**
 * GET /api/heartbeat/history — Return recent heartbeat runs
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 10), 50)

  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM heartbeat_runs ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as Array<{
      id: number
      timestamp: string
      summary: string
      task_count: number
      model: string | null
      cost_usd: number
      actionable: number
      checks_run: string
    }>

  const runs: HeartbeatRun[] = rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    summary: r.summary,
    taskCount: r.task_count,
    model: r.model,
    costUsd: r.cost_usd,
    actionable: r.actionable === 1,
    checksRun: JSON.parse(r.checks_run || '[]'),
  }))

  return NextResponse.json({ runs })
}
