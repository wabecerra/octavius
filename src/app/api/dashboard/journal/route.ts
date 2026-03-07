import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/journal */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500)
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM dashboard_journal ORDER BY timestamp DESC LIMIT ?').all(limit)
  return NextResponse.json({ entries: rows, total: rows.length })
}

/** POST /api/dashboard/journal */
export async function POST(request: Request) {
  const body = await request.json()
  const { text } = body
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  const id = body.id || nanoid()
  const timestamp = body.timestamp || new Date().toISOString()
  const db = getDatabase()
  db.prepare('INSERT INTO dashboard_journal (id, text, timestamp) VALUES (?, ?, ?)').run(id, text, timestamp)
  return NextResponse.json({ id, text, timestamp }, { status: 201 })
}
