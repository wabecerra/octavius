import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/schedule?date=YYYY-MM-DD */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM dashboard_schedule WHERE date = ? ORDER BY time').all(date) as Array<Record<string, unknown>>
  return NextResponse.json({
    items: rows.map(r => ({ id: r.id, date: r.date, time: r.time, title: r.title, done: r.done === 1 })),
    date,
  })
}

/** POST /api/dashboard/schedule */
export async function POST(request: Request) {
  const body = await request.json()
  const { title, time, date } = body
  if (!title || !time) return NextResponse.json({ error: 'title and time required' }, { status: 400 })
  const id = body.id || nanoid()
  const d = date || new Date().toISOString().split('T')[0]
  const db = getDatabase()
  db.prepare('INSERT INTO dashboard_schedule (id, date, time, title) VALUES (?, ?, ?, ?)').run(id, d, time, title)
  return NextResponse.json({ id, date: d, time, title, done: false }, { status: 201 })
}

/** PATCH /api/dashboard/schedule */
export async function PATCH(request: Request) {
  const { id, done, title, time } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = getDatabase()
  const sets: string[] = []
  const params: unknown[] = []
  if (done !== undefined) { sets.push('done = ?'); params.push(done ? 1 : 0) }
  if (title) { sets.push('title = ?'); params.push(title) }
  if (time) { sets.push('time = ?'); params.push(time) }
  if (sets.length === 0) return NextResponse.json({ error: 'no updates' }, { status: 400 })
  params.push(id)
  db.prepare(`UPDATE dashboard_schedule SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return NextResponse.json({ updated: id })
}
