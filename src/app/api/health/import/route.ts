import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { getDatabase } from '@/lib/memory/db'
import { parseRingConnCsv } from '@/lib/health/csv-parser'
import { isDuplicate } from '@/lib/health/dedup'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * POST /api/health/import
 *
 * Accepts multipart/form-data with a `file` field containing a CSV file.
 * Parses the CSV via `parseRingConnCsv`, deduplicates, and stores new
 * readings as episodic memories with source_type 'device_sync'.
 *
 * Returns `{ imported: number, skipped: Array<{ row: number, reason: string }> }`.
 */
export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart/form-data request' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field in form data' }, { status: 400 })
  }

  // Validate file type — accept .csv or text/csv content type
  const isCsvName = file.name.toLowerCase().endsWith('.csv')
  const isCsvType = file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
  if (!isCsvName && !isCsvType) {
    return NextResponse.json({ error: 'File must be a CSV (.csv)' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds maximum size of 10 MB' }, { status: 400 })
  }

  // Read file content
  const content = await file.text()

  // Parse CSV
  const { readings, skipped } = parseRingConnCsv(content)

  if (readings.length === 0 && skipped.length > 0) {
    return NextResponse.json(
      { imported: 0, skipped },
      { status: 200 },
    )
  }

  // Store readings (same pattern as ingest route)
  const db = getDatabase()
  const now = new Date().toISOString()

  const insertStmt = db.prepare(
    `INSERT INTO memory_items
      (memory_id, text, type, layer, source_type, source_id, agent_id,
       created_at, last_accessed, confidence, importance, tags,
       embedding_ref, consolidated_into, archived)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
  )

  let imported = 0

  for (const reading of readings) {
    if (isDuplicate(reading.dedupKey, db)) {
      skipped.push({ row: 0, reason: `Duplicate reading (${reading.readingType})` })
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
    imported++
  }

  return NextResponse.json({ imported, skipped })
}
