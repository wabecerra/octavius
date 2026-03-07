import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/focus-goals?date=YYYY-MM-DD */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM dashboard_focus_goals WHERE date = ? ORDER BY rowid').all(date)
  return NextResponse.json({ goals: rows, date })
}

/** POST /api/dashboard/focus-goals */
export async function POST(request: Request) {
  const body = await request.json()
  const { title, date } = body
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const d = date || new Date().toISOString().split('T')[0]
  const db = getDatabase()
  // Max 3 focus goals per day
  const count = (db.prepare('SELECT COUNT(*) as c FROM dashboard_focus_goals WHERE date = ?').get(d) as { c: number }).c
  if (count >= 3) return NextResponse.json({ error: 'Max 3 focus goals per day' }, { status: 400 })
  const id = body.id || nanoid()
  db.prepare('INSERT INTO dashboard_focus_goals (id, date, title) VALUES (?, ?, ?)').run(id, d, title)
  return NextResponse.json({ id, date: d, title }, { status: 201 })
}

/** DELETE /api/dashboard/focus-goals */
export async function DELETE(request: Request) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = getDatabase()
  db.prepare('DELETE FROM dashboard_focus_goals WHERE id = ?').run(id)
  return NextResponse.json({ deleted: id })
}
