/**
 * Cron Runner — node-cron integration for Octavius scheduled jobs.
 *
 * Loads enabled jobs from scheduled_agent_jobs table, schedules them with
 * node-cron, and manages job execution + logging.
 *
 * Built-in hourly stale task recovery:
 * - Tasks in-progress >2h with no activity → re-dispatch once
 * - Tasks in-progress >6h after re-dispatch → revert to backlog
 */
import cron, { type ScheduledTask } from 'node-cron'
import { getDatabase } from './memory/db'
import { refreshModelCatalog } from './model-catalog'

interface ScheduledJobRow {
  id: string
  name: string
  cron_expression: string
  agent_id: string
  task_template: string
  enabled: number
}

const activeCrons = new Map<string, ScheduledTask>()

/** Stale thresholds */
const STALE_REDISPATCH_MS = 2 * 60 * 60 * 1000   // 2 hours — try re-dispatch
const STALE_REVERT_MS = 6 * 60 * 60 * 1000        // 6 hours — give up, revert to backlog

/**
 * Start the cron runner — seeds default jobs, loads enabled jobs, and schedules them.
 * The built-in stale task recovery always runs hourly regardless of DB config.
 */
export function startCronRunner() {
  const db = getDatabase()

  // Seed default cron jobs on first run (INSERT OR IGNORE — idempotent)
  seedDefaultJobs(db)

  // Load enabled scheduled jobs from DB
  const jobs = db.prepare(
    'SELECT * FROM scheduled_agent_jobs WHERE enabled = 1'
  ).all() as ScheduledJobRow[]

  for (const job of jobs) {
    // The 'system' agent_id jobs are handled by built-in logic, not dispatched
    if (job.agent_id === 'system') continue
    scheduleJob(job)
  }

  // Built-in: stale task recovery — runs every hour at :05
  cron.schedule('5 * * * *', () => {
    pickUpStaleTasks().catch(err =>
      console.error('[cron] Stale task pickup failed:', err)
    )
  })

  // Built-in: daily model catalog refresh — runs at 3am
  cron.schedule('0 3 * * *', () => {
    refreshModelCatalog().catch(err =>
      console.error('[cron] Model catalog refresh failed:', err)
    )
  })

  // Built-in: run once at startup (after 30s delay) to catch stale tasks + refresh models
  setTimeout(() => {
    pickUpStaleTasks().catch(err =>
      console.error('[cron] Startup stale task pickup failed:', err)
    )
    refreshModelCatalog().catch(err =>
      console.error('[cron] Startup model catalog refresh failed:', err)
    )
  }, 30_000)

  console.log(`[cron] Started with ${jobs.length} scheduled jobs + built-in stale task recovery`)
}

/**
 * Schedule a single job with node-cron.
 * Validates cron expression and cancels any existing schedule.
 */
function scheduleJob(job: ScheduledJobRow) {
  if (!cron.validate(job.cron_expression)) {
    console.warn(`[cron] Invalid cron expression for job ${job.name}: ${job.cron_expression}`)
    return
  }

  // Cancel existing schedule if any
  activeCrons.get(job.id)?.stop()

  const task = cron.schedule(job.cron_expression, async () => {
    console.log(`[cron] Triggering job: ${job.name}`)
    const db = getDatabase()
    const startedAt = new Date().toISOString()

    try {
      // Dispatch via the agent dispatch API (internal call)
      const port = process.env.PORT ?? '3000'
      const res = await fetch(`http://localhost:${port}/api/agents/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: null,
          agentId: job.agent_id,
          instruction: job.task_template,
        }),
      })

      if (!res.ok) {
        throw new Error(`Dispatch failed: ${res.status} ${res.statusText}`)
      }

      // Log success
      db.prepare(
        'INSERT INTO job_runs (job_name, started_at, completed_at, success, details, error) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(job.name, startedAt, new Date().toISOString(), 1, JSON.stringify({ trigger: 'cron' }), null)

      console.log(`[cron] Job completed successfully: ${job.name}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      db.prepare(
        'INSERT INTO job_runs (job_name, started_at, completed_at, success, details, error) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(job.name, startedAt, new Date().toISOString(), 0, JSON.stringify({ trigger: 'cron' }), errorMsg)

      console.error(`[cron] Job failed: ${job.name} — ${errorMsg}`)
    }
  })

  activeCrons.set(job.id, task)
}

/**
 * Stale task recovery — runs hourly + once at startup.
 *
 * Two tiers:
 * 1. Tasks in-progress >2h with no recent activity → try re-dispatch once
 * 2. Tasks in-progress >6h (already re-dispatched or spawn_failed) → revert to backlog
 */
async function pickUpStaleTasks() {
  const db = getDatabase()
  const now = Date.now()
  const redispatchCutoff = new Date(now - STALE_REDISPATCH_MS).toISOString()
  const revertCutoff = new Date(now - STALE_REVERT_MS).toISOString()

  // Tier 2: revert very stale tasks to backlog (>6h)
  const veryStale = db.prepare(`
    SELECT id, title, quadrant
    FROM dashboard_tasks
    WHERE status = 'in-progress'
      AND updated_at < ?
    LIMIT 20
  `).all(revertCutoff) as Array<{ id: string; title: string; quadrant: string }>

  for (const task of veryStale) {
    db.prepare('UPDATE dashboard_tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('backlog', new Date().toISOString(), task.id)
    db.prepare(
      'INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(task.id, 'system', 'reverted', `Stale >6h — reverted to backlog by cron recovery`, new Date().toISOString())
    console.log(`[cron] Reverted very stale task to backlog: ${task.title}`)
  }

  // Get IDs we just reverted so we skip them in tier 1
  const revertedIds = new Set(veryStale.map(t => t.id))

  // Tier 1: re-dispatch moderately stale tasks (>2h but <6h)
  const moderatelyStale = db.prepare(`
    SELECT id, title, quadrant
    FROM dashboard_tasks
    WHERE status = 'in-progress'
      AND updated_at < ?
      AND updated_at >= ?
    LIMIT 10
  `).all(redispatchCutoff, revertCutoff) as Array<{ id: string; title: string; quadrant: string }>

  const toRedispatch = moderatelyStale.filter(t => !revertedIds.has(t.id))

  if (toRedispatch.length === 0 && veryStale.length === 0) {
    console.log('[cron] No stale tasks found')
    return
  }

  const port = process.env.PORT ?? '3000'
  for (const task of toRedispatch) {
    // Check if we already tried re-dispatching (avoid infinite retries)
    const recentRetry = db.prepare(`
      SELECT 1 FROM task_activity_log
      WHERE task_id = ? AND agent_id = 'system' AND action = 'redispatched'
        AND timestamp > ?
      LIMIT 1
    `).get(task.id, redispatchCutoff)

    if (recentRetry) {
      console.log(`[cron] Skipping ${task.title} — already re-dispatched recently`)
      continue
    }

    try {
      const res = await fetch(`http://localhost:${port}/api/agents/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          instruction: `This task has been in-progress for over 2 hours with no updates. Review the current state and either complete it or provide a progress update with next steps.`,
        }),
      })

      db.prepare(
        'INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)'
      ).run(task.id, 'system', 'redispatched', `Re-dispatched by cron recovery (status=${res.status})`, new Date().toISOString())

      if (res.ok) {
        console.log(`[cron] Re-dispatched stale task: ${task.title}`)
      } else {
        console.error(`[cron] Failed to re-dispatch task ${task.id}: ${res.status}`)
      }
    } catch (err) {
      console.error(`[cron] Failed to re-dispatch task ${task.id}:`, err)
    }
  }

  console.log(`[cron] Recovery complete: ${veryStale.length} reverted, ${toRedispatch.length} re-dispatched`)
}

/** Seed default cron jobs — idempotent via INSERT OR IGNORE. */
function seedDefaultJobs(db: ReturnType<typeof getDatabase>) {
  const now = new Date().toISOString()
  const seeds = [
    ['stale-task-recovery', 'Stale Task Recovery', '0 * * * *', 'system',
      'Scan for tasks stuck in-progress and either re-dispatch or revert to backlog.'],
    ['daily-task-review', 'Daily Task Review', '0 9 * * *', 'gen-industry',
      'Review all in-progress and backlog tasks across quadrants. Identify blockers, suggest priorities, and flag any tasks that need attention.'],
    ['weekly-kb-digest', 'Weekly KB Digest', '0 10 * * 1', 'gen-essence',
      'Produce a weekly digest of knowledge base additions, agent activity, and task completions. Store the summary in the KB for future reference.'],
  ] as const

  const insert = db.prepare(
    'INSERT OR IGNORE INTO scheduled_agent_jobs (id, name, cron_expression, agent_id, task_template, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
  )
  for (const [id, name, cronExpr, agentId, template] of seeds) {
    insert.run(id, name, cronExpr, agentId, template, now, now)
  }
}

/**
 * Reload scheduled jobs (call after CRUD operations).
 * Stops all existing jobs and re-loads from database.
 */
export function reloadCronJobs() {
  // Stop all existing
  for (const task of activeCrons.values()) {
    task.stop()
  }
  activeCrons.clear()

  // Re-load
  const db = getDatabase()
  const jobs = db.prepare(
    'SELECT * FROM scheduled_agent_jobs WHERE enabled = 1'
  ).all() as ScheduledJobRow[]

  for (const job of jobs) {
    scheduleJob(job)
  }

  console.log(`[cron] Reloaded ${jobs.length} scheduled jobs`)
}
