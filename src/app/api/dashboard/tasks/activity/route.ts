import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/**
 * GET /api/dashboard/tasks/activity — Get task activity log
 *
 * Query params:
 *   ?taskId=xxx — filter by task
 *   ?limit=20 — max results (default 20)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)

  const db = getDatabase()

  let query = 'SELECT * FROM task_activity_log'
  const params: unknown[] = []

  if (taskId) {
    query += ' WHERE task_id = ?'
    params.push(taskId)
  }

  query += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(query).all(...params) as Array<{
    id: number
    task_id: string
    agent_id: string
    action: string
    details: string
    model: string | null
    cost_usd: number
    timestamp: string
  }>

  return NextResponse.json({
    activities: rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      agentId: r.agent_id,
      action: r.action,
      details: r.details,
      model: r.model,
      costUsd: r.cost_usd,
      timestamp: r.timestamp,
    })),
  })
}
