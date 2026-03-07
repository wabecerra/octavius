import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/goals */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const quadrant = url.searchParams.get('quadrant')
  const db = getDatabase()

  let query = 'SELECT * FROM dashboard_goals'
  const params: unknown[] = []
  if (quadrant) { query += ' WHERE quadrant = ?'; params.push(quadrant) }
  query += ' ORDER BY created_at DESC'

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>
  return NextResponse.json({
    goals: rows.map(r => ({
      id: r.id, quadrant: r.quadrant, title: r.title,
      description: r.description || '', targetDate: r.target_date,
      progressPct: r.progress_pct, createdAt: r.created_at,
    })),
    total: rows.length,
  })
}

/** POST /api/dashboard/goals */
export async function POST(request: Request) {
  const body = await request.json()
  const { quadrant, title, description, targetDate, progressPct } = body
  if (!title || !quadrant) {
    return NextResponse.json({ error: 'title and quadrant required' }, { status: 400 })
  }
  const id = body.id || nanoid()
  const now = new Date().toISOString()
  const db = getDatabase()
  db.prepare(
    'INSERT INTO dashboard_goals (id, quadrant, title, description, target_date, progress_pct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, quadrant, title, description || '', targetDate || null, progressPct || 0, now)
  return NextResponse.json({ id, quadrant, title, progressPct: progressPct || 0 }, { status: 201 })
}

/** PATCH /api/dashboard/goals — Update progress */
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, progressPct, title, description } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getDatabase()
  const sets: string[] = []
  const params: unknown[] = []
  if (progressPct !== undefined) { sets.push('progress_pct = ?'); params.push(progressPct) }
  if (title) { sets.push('title = ?'); params.push(title) }
  if (description !== undefined) { sets.push('description = ?'); params.push(description) }
  if (sets.length === 0) return NextResponse.json({ error: 'no updates' }, { status: 400 })

  params.push(id)
  db.prepare(`UPDATE dashboard_goals SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return NextResponse.json({ updated: id })
}
