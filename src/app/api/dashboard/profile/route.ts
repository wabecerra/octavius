import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/** GET /api/dashboard/profile */
export async function GET() {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM dashboard_profile').all() as Array<{ key: string; value: string }>
  const profile: Record<string, string> = {}
  for (const r of rows) profile[r.key] = r.value
  return NextResponse.json(profile)
}

/** PUT /api/dashboard/profile */
export async function PUT(request: Request) {
  const updates = await request.json() as Record<string, string>
  const db = getDatabase()
  const upsert = db.prepare('INSERT INTO dashboard_profile (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      upsert.run(k, String(v))
    }
  })
  tx()
  return NextResponse.json(updates)
}
