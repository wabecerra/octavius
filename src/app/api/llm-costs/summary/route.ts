import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/** GET /api/llm-costs/summary?period=today|week|month|all */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? 'today'

  const db = getDatabase()
  const sinceMap: Record<string, string> = {
    today: new Date().toISOString().slice(0, 10),
    week: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    month: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    all: '2000-01-01',
  }
  const since = sinceMap[period] ?? sinceMap.today

  const total = db.prepare(
    `SELECT COALESCE(SUM(cost_total_usd), 0) as total FROM llm_logs WHERE timestamp >= ?`
  ).get(since) as { total: number }

  const byModel = db.prepare(
    `SELECT model, COALESCE(SUM(cost_total_usd), 0) as cost, COUNT(*) as calls
     FROM llm_logs WHERE timestamp >= ? GROUP BY model ORDER BY cost DESC`
  ).all(since) as Array<{ model: string; cost: number; calls: number }>

  const byAgent = db.prepare(
    `SELECT agent_id, COALESCE(SUM(cost_total_usd), 0) as cost, COUNT(*) as calls
     FROM llm_logs WHERE timestamp >= ? AND agent_id IS NOT NULL GROUP BY agent_id ORDER BY cost DESC`
  ).all(since) as Array<{ agent_id: string; cost: number; calls: number }>

  return NextResponse.json({ period, since, total: total.total, byModel, byAgent })
}
