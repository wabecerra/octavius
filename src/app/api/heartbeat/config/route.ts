import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

// Force dynamic rendering (GET + PUT in same route)
export const dynamic = 'force-dynamic'

export interface HeartbeatConfig {
  enabled: boolean
  intervalMinutes: number
  model: string
  autonomousMode: boolean
  maxDispatchPerRun: number
  checks: {
    kanbanReview: boolean
    costCheck: boolean
    costCheckThresholdUsd: number
    costCheckIntervalHours: number
  }
}

const DEFAULT_CONFIG: HeartbeatConfig = {
  enabled: true,
  intervalMinutes: 30,
  model: 'qwen/qwen3-235b-a22b-2507',
  autonomousMode: false,
  maxDispatchPerRun: 1,
  checks: {
    kanbanReview: true,
    costCheck: true,
    costCheckThresholdUsd: 5,
    costCheckIntervalHours: 6,
  },
}

function loadConfig(db: ReturnType<typeof getDatabase>): HeartbeatConfig {
  const rows = db.prepare('SELECT key, value FROM heartbeat_config').all() as { key: string; value: string }[]
  if (rows.length === 0) return { ...DEFAULT_CONFIG }

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    enabled: map.enabled ? map.enabled === 'true' : DEFAULT_CONFIG.enabled,
    intervalMinutes: map.intervalMinutes ? Number(map.intervalMinutes) : DEFAULT_CONFIG.intervalMinutes,
    model: map.model ?? DEFAULT_CONFIG.model,
    autonomousMode: map.autonomousMode === 'true',
    maxDispatchPerRun: map.maxDispatchPerRun ? Number(map.maxDispatchPerRun) : DEFAULT_CONFIG.maxDispatchPerRun,
    checks: map.checks ? JSON.parse(map.checks) : { ...DEFAULT_CONFIG.checks },
  }
}

/**
 * GET /api/heartbeat/config — Return heartbeat configuration
 */
export async function GET() {
  const db = getDatabase()
  const config = loadConfig(db)
  return NextResponse.json(config)
}

/**
 * PUT /api/heartbeat/config — Save heartbeat configuration
 */
export async function PUT(request: Request) {
  const body = await request.json()
  const db = getDatabase()
  const now = new Date().toISOString()

  const upsert = db.prepare(
    'INSERT OR REPLACE INTO heartbeat_config (key, value, updated_at) VALUES (?, ?, ?)',
  )

  const saveAll = db.transaction(() => {
    if (body.enabled !== undefined) upsert.run('enabled', String(body.enabled), now)
    if (body.intervalMinutes !== undefined) upsert.run('intervalMinutes', String(body.intervalMinutes), now)
    if (body.model !== undefined) upsert.run('model', body.model, now)
    if (body.autonomousMode !== undefined) upsert.run('autonomousMode', String(body.autonomousMode), now)
    if (body.maxDispatchPerRun !== undefined) upsert.run('maxDispatchPerRun', String(body.maxDispatchPerRun), now)
    if (body.checks !== undefined) upsert.run('checks', JSON.stringify(body.checks), now)
  })

  saveAll()

  const config = loadConfig(db)
  return NextResponse.json(config)
}
