import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/gratitude */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const date = url.searchParams.get('date')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 200)
  const db = getDatabase()
  let query = 'SELECT * FROM dashboard_gratitude'
  const params: unknown[] = []
  if (date) { query += ' WHERE date = ?'; params.push(date) }
  query += ' ORDER BY date DESC LIMIT ?'
  params.push(limit)
  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>
  return NextResponse.json({
    entries: rows.map(r => ({ id: r.id, date: r.date, items: JSON.parse(r.items as string) })),
  })
}

/** POST /api/dashboard/gratitude */
export async function POST(request: Request) {
  const body = await request.json()
  const { items, date } = body
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 })
  }
  const id = body.id || nanoid()
  const d = date || new Date().toISOString().split('T')[0]
  const db = getDatabase()
  db.prepare('INSERT INTO dashboard_gratitude (id, date, items) VALUES (?, ?, ?)').run(id, d, JSON.stringify(items))
  return NextResponse.json({ id, date: d, items }, { status: 201 })
}
