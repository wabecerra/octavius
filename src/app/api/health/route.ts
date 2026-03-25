import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/**
 * GET /api/health — System health check
 *
 * Reports status of all Octavius subsystems for monitoring and debugging.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {}

  // 1. Database
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) as n FROM dashboard_tasks').get() as { n: number }
    checks.database = { ok: true, detail: `${row.n} tasks` }
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : 'unknown' }
  }

  // 2. Memory service
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) as n FROM memory_items').get() as { n: number }
    checks.memory = { ok: true, detail: `${row.n} items` }
  } catch (err) {
    checks.memory = { ok: false, detail: err instanceof Error ? err.message : 'unknown' }
  }

  // 3. LLM Cost tables
  try {
    const db = getDatabase()
    // Check if llm_logs table exists
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='llm_logs'").get()
    if (table) {
      const row = db.prepare('SELECT COUNT(*) as n, COALESCE(SUM(cost_total_usd), 0) as cost FROM llm_logs').get() as { n: number; cost: number }
      checks.llm_costs = { ok: true, detail: `${row.n} logs, $${row.cost.toFixed(4)} total` }
    } else {
      checks.llm_costs = { ok: false, detail: 'llm_logs table missing — will be created on first LLM call' }
    }
  } catch (err) {
    checks.llm_costs = { ok: false, detail: err instanceof Error ? err.message : 'unknown' }
  }

  // 4. Agent configs
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) as n FROM agent_model_config').get() as { n: number }
    checks.agent_configs = { ok: row.n > 0, detail: `${row.n} agents configured` }
  } catch (err) {
    checks.agent_configs = { ok: false, detail: err instanceof Error ? err.message : 'unknown' }
  }

  // 5. OpenClaw gateway
  try {
    const host = process.env.OPENCLAW_GATEWAY_HOST || 'localhost'
    const port = process.env.OPENCLAW_GATEWAY_PORT || '18789'
    const res = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(3000) })
    checks.gateway = { ok: res.ok, detail: `${host}:${port} — HTTP ${res.status}` }
  } catch {
    checks.gateway = { ok: false, detail: 'Gateway unreachable' }
  }

  // 6. OpenClaw CLI
  try {
    const { execSync } = await import('node:child_process')
    const version = execSync('openclaw --version 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim()
    checks.openclaw_cli = { ok: true, detail: version }
  } catch {
    checks.openclaw_cli = { ok: false, detail: 'openclaw binary not found in PATH' }
  }

  // 7. Obsidian sync
  try {
    const db = getDatabase()
    const row = db.prepare("SELECT value FROM config WHERE key = 'obsidian_vault_path'").get() as { value: string } | undefined
    if (row?.value) {
      const { existsSync } = await import('node:fs')
      const exists = existsSync(row.value)
      checks.obsidian = { ok: exists, detail: exists ? `Vault: ${row.value}` : `Vault path not found: ${row.value}` }
    } else {
      checks.obsidian = { ok: true, detail: 'Not configured (optional) — set vault path in Settings' }
    }
  } catch (err) {
    checks.obsidian = { ok: false, detail: err instanceof Error ? err.message : 'unknown' }
  }

  // 8. Auth (users table)
  try {
    const db = getDatabase()
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
    if (table) {
      const row = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }
      checks.auth = { ok: row.n > 0, detail: `${row.n} user(s)` }
    } else {
      checks.auth = { ok: false, detail: 'users table missing' }
    }
  } catch (err) {
    checks.auth = { ok: false, detail: err instanceof Error ? err.message : 'unknown' }
  }

  const allOk = Object.values(checks).every(c => c.ok)

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  }, { status: allOk ? 200 : 207 })
}
