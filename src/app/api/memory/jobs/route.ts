import { NextResponse } from 'next/server'
import { authenticateRequest, getDb } from '../auth'

interface JobRow {
  job_name: string
  started_at: string
  completed_at: string | null
  success: number | null
  details: string
  error: string | null
}

/**
 * GET /api/memory/jobs — Get job run status for all or a specific job.
 * Query params: name (optional, filter by job name), limit (default 10)
 */
export async function GET(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const limit = Number(searchParams.get('limit') ?? '10')

  const db = getDb()

  let rows: JobRow[]
  if (name) {
    rows = db
      .prepare(
        'SELECT job_name, started_at, completed_at, success, details, error FROM job_runs WHERE job_name = ? ORDER BY id DESC LIMIT ?',
      )
      .all(name, limit) as JobRow[]
  } else {
    rows = db
      .prepare(
        'SELECT job_name, started_at, completed_at, success, details, error FROM job_runs ORDER BY id DESC LIMIT ?',
      )
      .all(limit) as JobRow[]
  }

  const jobs = rows.map((row) => ({
    job_name: row.job_name,
    started_at: row.started_at,
    completed_at: row.completed_at,
    success: row.success === 1,
    details: JSON.parse(row.details),
    error: row.error,
  }))

  return NextResponse.json({ jobs })
}

/**
 * POST /api/memory/jobs — Trigger a manual job run.
 * Body: { name: string }
 *
 * Note: This endpoint inserts a job_runs record to signal a manual trigger.
 * The actual job execution is handled by the JobScheduler in the server process.
 */
export async function POST(request: Request) {
  const authError = authenticateRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as { name: string }
    if (!body.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const db = getDb()
    const now = new Date().toISOString()

    // Record a manual trigger entry
    db.prepare(
      'INSERT INTO job_runs (job_name, started_at, completed_at, success, details, error) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(body.name, now, null, null, JSON.stringify({ trigger: 'manual' }), null)

    return NextResponse.json({ message: `Job '${body.name}' triggered`, triggered_at: now }, { status: 202 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
