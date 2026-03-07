import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/** GET /api/dashboard/tasks/[id] */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM dashboard_tasks WHERE id = ?').get(params.id) as Record<string, unknown> | undefined
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    id: row.id, title: row.title, description: row.description || '',
    priority: row.priority, status: row.status, dueDate: row.due_date,
    completed: row.completed === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  })
}

/** DELETE /api/dashboard/tasks/[id] */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM dashboard_tasks WHERE id = ?').run(params.id)
  if (result.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: params.id })
}

/** PATCH /api/dashboard/tasks/[id] — Update single task */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const updates = await request.json()
  const db = getDatabase()
  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const p: unknown[] = [now]
  if (updates.status) { sets.push('status = ?'); p.push(updates.status) }
  if (updates.priority) { sets.push('priority = ?'); p.push(updates.priority) }
  if (updates.completed !== undefined) { sets.push('completed = ?'); p.push(updates.completed ? 1 : 0) }
  if (updates.title) { sets.push('title = ?'); p.push(updates.title) }
  if (updates.description !== undefined) { sets.push('description = ?'); p.push(updates.description) }
  if (updates.dueDate !== undefined) { sets.push('due_date = ?'); p.push(updates.dueDate) }
  p.push(params.id)
  db.prepare(`UPDATE dashboard_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...p)
  // Return updated task
  const row = db.prepare('SELECT * FROM dashboard_tasks WHERE id = ?').get(params.id) as Record<string, unknown>
  return NextResponse.json({
    id: row.id, title: row.title, description: row.description || '',
    priority: row.priority, status: row.status, dueDate: row.due_date,
    completed: row.completed === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  })
}
