import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/**
 * GET /api/dashboard/tasks — List tasks with optional filters.
 *
 * Query params:
 *   status, priority, quadrant   — exact match filters
 *   since, until                 — date range on created_at (YYYY-MM-DD, inclusive)
 *   includeOpen                  — "1" to also include non-completed tasks created
 *                                  before `since` (sprint carry-over)
 *   limit, offset                — pagination
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const priority = url.searchParams.get('priority')
  const quadrant = url.searchParams.get('quadrant')
  const since = url.searchParams.get('since')   // YYYY-MM-DD
  const until = url.searchParams.get('until')   // YYYY-MM-DD
  const includeOpen = url.searchParams.get('includeOpen') === '1'
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500)
  const offset = Number(url.searchParams.get('offset')) || 0

  const db = getDatabase()

  const conditions: string[] = []
  const params: unknown[] = []

  if (status) { conditions.push('status = ?'); params.push(status) }
  if (priority) { conditions.push('priority = ?'); params.push(priority) }
  if (quadrant) { conditions.push('quadrant = ?'); params.push(quadrant) }

  // Sprint-scoped date filtering:
  // When includeOpen=1, return tasks created in the date range
  // PLUS any incomplete tasks from before the range (carry-over).
  if (since && until && includeOpen) {
    conditions.push(
      '((date(created_at) >= ? AND date(created_at) <= ?) OR (completed = 0 AND date(created_at) < ?))'
    )
    params.push(since, until, since)
  } else if (since && until) {
    conditions.push('date(created_at) >= ? AND date(created_at) <= ?')
    params.push(since, until)
  } else if (since) {
    conditions.push('date(created_at) >= ?')
    params.push(since)
  } else if (until) {
    conditions.push('date(created_at) <= ?')
    params.push(until)
  }

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1'
  const query = `SELECT * FROM dashboard_tasks WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>

  const countParams = params.slice(0, -2)
  const total = db.prepare(
    `SELECT COUNT(*) as count FROM dashboard_tasks WHERE ${whereClause}`
  ).get(...countParams) as { count: number }

  return NextResponse.json({
    tasks: rows.map(rowToTask),
    total: total.count,
  })
}

/**
 * POST /api/dashboard/tasks — Create a new task
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { title, description, priority, status, dueDate, quadrant, project } = body

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const id = body.id || nanoid()
  const now = new Date().toISOString()
  const db = getDatabase()

  db.prepare(
    `INSERT INTO dashboard_tasks (id, title, description, priority, status, due_date, quadrant, project, completed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    title.trim(),
    description?.trim() || '',
    priority || 'medium',
    status || 'backlog',
    dueDate || null,
    quadrant || '',
    project || '',
    now,
    now,
  )

  const row = db.prepare('SELECT * FROM dashboard_tasks WHERE id = ?').get(id) as Record<string, unknown>
  return NextResponse.json(rowToTask(row), { status: 201 })
}

/**
 * PATCH /api/dashboard/tasks — Bulk update (move status, etc.)
 * Body: { ids: string[], updates: { status?, priority?, completed? } }
 */
export async function PATCH(request: Request) {
  const body = await request.json()
  const { ids, updates } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const db = getDatabase()
  const now = new Date().toISOString()
  const setClauses: string[] = ['updated_at = ?']
  const params: unknown[] = [now]

  if (updates.status) { setClauses.push('status = ?'); params.push(updates.status) }
  if (updates.priority) { setClauses.push('priority = ?'); params.push(updates.priority) }
  if (updates.completed !== undefined) { setClauses.push('completed = ?'); params.push(updates.completed ? 1 : 0) }
  if (updates.title) { setClauses.push('title = ?'); params.push(updates.title) }
  if (updates.description !== undefined) { setClauses.push('description = ?'); params.push(updates.description) }
  if (updates.quadrant !== undefined) { setClauses.push('quadrant = ?'); params.push(updates.quadrant) }
  if (updates.project !== undefined) { setClauses.push('project = ?'); params.push(updates.project) }

  const placeholders = ids.map(() => '?').join(',')
  params.push(...ids)

  db.prepare(`UPDATE dashboard_tasks SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`).run(...params)

  return NextResponse.json({ updated: ids.length })
}

function rowToTask(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date || undefined,
    quadrant: row.quadrant || '',
    project: row.project || '',
    completed: row.completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
