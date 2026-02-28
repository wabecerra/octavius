import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { authenticateRequest } from '@/app/api/memory/auth'
import { getDatabase } from '@/lib/memory/db'
import { isDuplicate } from '@/lib/health/dedup'
import type { CanonicalReading, ReadingType, HealthSource } from '@/lib/health/types'

const VALID_READING_TYPES: ReadingType[] = ['heart_rate', 'hrv', 'spo2', 'sleep', 'activity']
const VALID_SOURCES: HealthSource[] = ['csv_import', 'rook_webhook', 'apple_health_webhook']

/**
 * Validates that a single reading has the required shape.
 * Returns an error string if invalid, null if valid.
 */
function validateReading(reading: unknown, index: number): string | null {
  if (reading == null || typeof reading !== 'object') {
    return `readings[${index}]: must be an object`
  }
  const r = reading as Record<string, unknown>

  if (!VALID_READING_TYPES.includes(r.readingType as ReadingType)) {
    return `readings[${index}]: invalid or missing readingType`
  }
  if (!VALID_SOURCES.includes(r.source as HealthSource)) {
    return `readings[${index}]: invalid or missing source`
  }
  if (r.data == null || typeof r.data !== 'object') {
    return `readings[${index}]: missing or invalid data`
  }
  if (typeof r.dedupKey !== 'string' || r.dedupKey.length === 0) {
    return `readings[${index}]: missing or invalid dedupKey`
  }
  return null
}

/**
 * POST /api/health/ingest
 *
 * Accepts `{ readings: CanonicalReading[] }`, deduplicates, and stores
 * new readings as episodic memories with source_type 'device_sync'.
 *
 * Returns `{ stored: number, duplicates: number }`.
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body == null || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
  }

  const { readings } = body as { readings?: unknown }

  if (!Array.isArray(readings)) {
    return NextResponse.json(
      { error: 'Missing or invalid "readings" array' },
      { status: 400 },
    )
  }

  // Validate each reading's schema
  for (let i = 0; i < readings.length; i++) {
    const err = validateReading(readings[i], i)
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 })
    }
  }

  const db = getDatabase()
  const now = new Date().toISOString()

  const insertStmt = db.prepare(
    `INSERT INTO memory_items
      (memory_id, text, type, layer, source_type, source_id, agent_id,
       created_at, last_accessed, confidence, importance, tags,
       embedding_ref, consolidated_into, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
  )

  let stored = 0
  let duplicates = 0

  for (const reading of readings as CanonicalReading[]) {
    if (isDuplicate(reading.dedupKey, db)) {
      duplicates++
      continue
    }

    insertStmt.run(
      nanoid(),
      JSON.stringify(reading.data),
      'episodic',
      'daily_notes',
      'device_sync',
      reading.dedupKey,
      null,
      now,
      now,
      0.5,
      0.5,
      JSON.stringify(['lifeforce', reading.readingType]),
    )
    stored++
  }

  return NextResponse.json({ stored, duplicates })
}
