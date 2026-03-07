import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

/** GET /api/dashboard/connections */
export async function GET() {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM dashboard_connections ORDER BY last_contact_date DESC').all() as Array<Record<string, unknown>>
  return NextResponse.json({
    connections: rows.map(r => ({
      id: r.id, name: r.name, relationshipType: r.relationship_type,
      lastContactDate: r.last_contact_date, reminderFrequencyDays: r.reminder_frequency_days,
    })),
    total: rows.length,
  })
}

/** POST /api/dashboard/connections */
export async function POST(request: Request) {
  const body = await request.json()
  const { name, relationshipType, lastContactDate, reminderFrequencyDays } = body
  if (!name || !relationshipType) {
    return NextResponse.json({ error: 'name and relationshipType required' }, { status: 400 })
  }
  const id = body.id || nanoid()
  const db = getDatabase()
  db.prepare(
    'INSERT INTO dashboard_connections (id, name, relationship_type, last_contact_date, reminder_frequency_days) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, relationshipType, lastContactDate || new Date().toISOString().split('T')[0], reminderFrequencyDays || 14)
  return NextResponse.json({ id, name, relationshipType }, { status: 201 })
}

/** PATCH /api/dashboard/connections */
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, lastContactDate, name, reminderFrequencyDays } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getDatabase()
  const sets: string[] = []
  const params: unknown[] = []
  if (lastContactDate) { sets.push('last_contact_date = ?'); params.push(lastContactDate) }
  if (name) { sets.push('name = ?'); params.push(name) }
  if (reminderFrequencyDays) { sets.push('reminder_frequency_days = ?'); params.push(reminderFrequencyDays) }
  if (sets.length === 0) return NextResponse.json({ error: 'no updates' }, { status: 400 })

  params.push(id)
  db.prepare(`UPDATE dashboard_connections SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return NextResponse.json({ updated: id })
}
