import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/**
 * GET /api/dashboard/tasks/reconcile — Detect stale in-progress tasks
 *
 * Returns tasks that are "in-progress" but have no agent activity in the
 * last N hours (default 24). These are likely abandoned or stuck.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const staleHours = Math.min(Number(searchParams.get('staleHours') ?? 24), 720)

  const db = getDatabase()
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString()

  // Find in-progress tasks whose last activity_log entry is older than cutoff
  // or that have NO activity_log entries at all
  const staleTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.quadrant, t.updated_at,
           MAX(a.timestamp) as last_agent_activity,
           a.agent_id as last_agent_id
    FROM dashboard_tasks t
    LEFT JOIN task_activity_log a ON a.task_id = t.id
    WHERE t.status = 'in-progress'
    GROUP BY t.id
    HAVING last_agent_activity IS NULL OR last_agent_activity < ?
    ORDER BY t.updated_at ASC
  `).all(cutoff) as Array<{
    id: string
    title: string
    status: string
    quadrant: string
    updated_at: string
    last_agent_activity: string | null
    last_agent_id: string | null
  }>

  return NextResponse.json({
    staleTasks: staleTasks.map(t => ({
      id: t.id,
      title: t.title,
      quadrant: t.quadrant,
      updatedAt: t.updated_at,
      lastAgentActivity: t.last_agent_activity,
      lastAgentId: t.last_agent_id,
      staleHours: t.last_agent_activity
        ? Math.round((Date.now() - new Date(t.last_agent_activity).getTime()) / (60 * 60 * 1000))
        : null,
    })),
    count: staleTasks.length,
  })
}

/**
 * POST /api/dashboard/tasks/reconcile — Re-dispatch or revert stale tasks
 *
 * Body: { action: 'redispatch' | 'revert-to-backlog', taskIds?: string[], staleHours?: number }
 *
 * - redispatch: Re-dispatches stale tasks to their quadrant agent
 * - revert-to-backlog: Moves stale tasks back to backlog status
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { action, taskIds, staleHours = 24 } = body as {
    action: 'redispatch' | 'revert-to-backlog'
    taskIds?: string[]
    staleHours?: number
  }

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  const db = getDatabase()
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString()

  // Get target tasks
  let targets: Array<{ id: string; title: string; quadrant: string }>
  if (taskIds?.length) {
    targets = db.prepare(
      `SELECT id, title, quadrant FROM dashboard_tasks WHERE id IN (${taskIds.map(() => '?').join(',')}) AND status = 'in-progress'`
    ).all(...taskIds) as typeof targets
  } else {
    targets = db.prepare(`
      SELECT t.id, t.title, t.quadrant
      FROM dashboard_tasks t
      LEFT JOIN task_activity_log a ON a.task_id = t.id
      WHERE t.status = 'in-progress'
      GROUP BY t.id
      HAVING MAX(a.timestamp) IS NULL OR MAX(a.timestamp) < ?
    `).all(cutoff) as typeof targets
  }

  if (targets.length === 0) {
    return NextResponse.json({ message: 'No stale tasks found', affected: 0 })
  }

  const now = new Date().toISOString()
  const results: Array<{ taskId: string; action: string; result: string }> = []

  if (action === 'revert-to-backlog') {
    for (const task of targets) {
      db.prepare('UPDATE dashboard_tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('backlog', now, task.id)
      db.prepare(
        `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(task.id, 'system', 'reverted', `Stale task reverted to backlog by reconciliation`, null, 0, now)
      results.push({ taskId: task.id, action: 'reverted', result: 'moved to backlog' })
    }
  } else if (action === 'redispatch') {
    for (const task of targets) {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/agents/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            instruction: 'This task was stale and has been re-dispatched. Review previous work and continue.',
          }),
        })
        results.push({
          taskId: task.id,
          action: 'redispatched',
          result: res.ok ? 'success' : `failed: HTTP ${res.status}`,
        })
      } catch (err) {
        results.push({
          taskId: task.id,
          action: 'redispatched',
          result: `failed: ${err instanceof Error ? err.message : 'unknown'}`,
        })
      }
    }
  }

  return NextResponse.json({ affected: results.length, results })
}
