import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/journal — Query params: since, until (YYYY-MM-DD), limit */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500)
  const since = url.searchParams.get('since')
  const until = url.searchParams.get('until')

  const db = getDatabase()
  const conditions: string[] = []
  const params: unknown[] = []

  if (since) { conditions.push('date(timestamp) >= ?'); params.push(since) }
  if (until) { conditions.push('date(timestamp) <= ?'); params.push(until) }

  let query = 'SELECT * FROM dashboard_journal'
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ')
  query += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(query).all(...params)
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
