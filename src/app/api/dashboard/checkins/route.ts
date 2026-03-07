import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/**
 * GET /api/dashboard/checkins — List check-ins
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 500)
  const since = url.searchParams.get('since') // ISO date

  const db = getDatabase()
  let query = 'SELECT * FROM dashboard_checkins'
  const params: unknown[] = []

  if (since) {
    query += ' WHERE timestamp >= ?'
    params.push(since)
  }

  query += ' ORDER BY timestamp DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>
  return NextResponse.json({ checkins: rows, total: rows.length })
}

/**
 * POST /api/dashboard/checkins — Create a wellness check-in
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { mood, energy, stress } = body

  for (const [field, val] of Object.entries({ mood, energy, stress })) {
    if (typeof val !== 'number' || val < 1 || val > 5) {
      return NextResponse.json({ error: `${field} must be 1-5` }, { status: 400 })
    }
  }

  const id = body.id || nanoid()
  const timestamp = body.timestamp || new Date().toISOString()
  const db = getDatabase()

  db.prepare(
    'INSERT INTO dashboard_checkins (id, timestamp, mood, energy, stress) VALUES (?, ?, ?, ?, ?)'
  ).run(id, timestamp, mood, energy, stress)

  return NextResponse.json({ id, timestamp, mood, energy, stress }, { status: 201 })
}
