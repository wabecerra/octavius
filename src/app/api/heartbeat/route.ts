import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { callAndLog, MODELS } from '@/lib/openrouter'
import { spawnAgent } from '@/lib/agent-spawner'

// ─── Helpers ───

type DB = ReturnType<typeof getDatabase>

function getHeartbeatModel(db: DB): string {
  try {
    const row = db.prepare("SELECT value FROM heartbeat_config WHERE key = 'model'").get() as { value: string } | undefined
    return row?.value || MODELS.cheap
  } catch {
    return MODELS.cheap
  }
}

function getHeartbeatConfig(db: DB) {
  const rows = db.prepare('SELECT key, value FROM heartbeat_config').all() as { key: string; value: string }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    enabled: map.enabled !== 'false',
    autonomousMode: map.autonomousMode === 'true',
    maxDispatchPerRun: Number(map.maxDispatchPerRun ?? 1),
    checks: map.checks ? JSON.parse(map.checks) : { kanbanReview: true, costCheck: true, costCheckThresholdUsd: 5, costCheckIntervalHours: 6 },
  }
}

function logHeartbeatRun(
  db: DB,
  run: { summary: string; taskCount: number; model: string | null; costUsd: number; actionable: boolean; checksRun: string[] },
) {
  try {
    db.prepare(
      `INSERT INTO heartbeat_runs (timestamp, summary, task_count, model, cost_usd, actionable, checks_run)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(new Date().toISOString(), run.summary, run.taskCount, run.model, run.costUsd, run.actionable ? 1 : 0, JSON.stringify(run.checksRun))
  } catch { /* best-effort */ }
}

// ─── POST /api/heartbeat — Autonomous orchestrator heartbeat ───

export async function POST() {
  const db = getDatabase()
  const config = getHeartbeatConfig(db)
  const heartbeatModel = getHeartbeatModel(db)

  // Fetch open tasks
  const tasks = db.prepare(
    `SELECT id, title, description, priority, status, quadrant, project, due_date, created_at
     FROM dashboard_tasks
     WHERE status IN ('backlog', 'in-progress')
     ORDER BY
       CASE status WHEN 'in-progress' THEN 0 ELSE 1 END,
       CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at ASC`,
  ).all() as Array<Record<string, unknown>>

  if (tasks.length === 0) {
    const result = { summary: 'No open tasks. Kanban board is clear! 🎉', taskCount: 0, model: null, costUsd: 0 }
    logHeartbeatRun(db, { ...result, actionable: false, checksRun: ['kanban'] })
    return NextResponse.json({ ...result, dispatched: [] })
  }

  const inProgress = tasks.filter((t) => t.status === 'in-progress')
  const backlog = tasks.filter((t) => t.status === 'backlog')
  const dispatched: Array<{ taskId: string; title: string; action: string; agentId: string; costUsd: number; kbContextUsed: boolean }> = []
  let totalDispatchCost = 0

  // ── Phase 1: Autonomous spawn (if enabled) ──
  if (config.autonomousMode) {
    const maxDispatch = config.maxDispatchPerRun

    // First: progress in-progress tasks
    for (const task of inProgress) {
      if (dispatched.length >= maxDispatch) break
      try {
        const result = await spawnAgent({ taskId: task.id as string })
        dispatched.push({
          taskId: task.id as string,
          title: task.title as string,
          action: result.action,
          agentId: result.agentId,
          costUsd: result.costUsd,
          kbContextUsed: result.kbContextUsed,
        })
        totalDispatchCost += result.costUsd
      } catch (err) {
        console.error(`[heartbeat] Spawn failed for task ${task.id}:`, err)
      }
    }

    // Then: pull high-priority from backlog
    const highPriorityBacklog = backlog.filter((t) => t.priority === 'high')
    for (const task of highPriorityBacklog) {
      if (dispatched.length >= maxDispatch) break
      try {
        const result = await spawnAgent({ taskId: task.id as string })
        dispatched.push({
          taskId: task.id as string,
          title: task.title as string,
          action: result.action,
          agentId: result.agentId,
          costUsd: result.costUsd,
          kbContextUsed: result.kbContextUsed,
        })
        totalDispatchCost += result.costUsd
      } catch (err) {
        console.error(`[heartbeat] Spawn failed for task ${task.id}:`, err)
      }
    }
  }

  // ── Phase 2: LLM briefing (always, uses cheap model) ──
  const updatedTasks = db.prepare(
    `SELECT id, title, description, priority, status, quadrant, project, due_date, created_at
     FROM dashboard_tasks
     WHERE status IN ('backlog', 'in-progress')
     ORDER BY
       CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at ASC`,
  ).all() as Array<Record<string, unknown>>

  const taskList = updatedTasks.map((t, i) => {
    const parts = [`${i + 1}. [${t.priority}] ${t.title}`]
    if (t.status === 'in-progress') parts.push('(IN PROGRESS)')
    if (t.quadrant) parts.push(`[${t.quadrant}]`)
    if (t.project) parts.push(`#${t.project}`)
    if (t.due_date) parts.push(`due:${t.due_date}`)
    return parts.join(' ')
  }).join('\n')

  let briefingSummary = ''
  let briefingCost = 0

  if (updatedTasks.length > 0) {
    const dispatchSummary = dispatched.length > 0
      ? `\n\nAgent activity this cycle:\n${dispatched.map((d) => `- ${d.action}: "${d.title}" (${d.agentId}${d.kbContextUsed ? ', used KB' : ''}, $${d.costUsd.toFixed(4)})`).join('\n')}`
      : ''

    const systemPrompt = `You are a productivity assistant reviewing a kanban board. Be concise and actionable. Use 2-4 sentences max. Highlight what should be worked on today. If agents did work this cycle, briefly acknowledge it.`
    const userPrompt = `Open tasks:\n\n${taskList}${dispatchSummary}\n\nGive a quick daily briefing.`

    try {
      const result = await callAndLog(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: heartbeatModel, maxTokens: 256, temperature: 0.3, label: 'heartbeat' },
      )
      briefingSummary = result.text
      briefingCost = result.costUsd
    } catch {
      briefingSummary = `${updatedTasks.length} open tasks. ${dispatched.length} dispatched this cycle.`
    }
  } else {
    briefingSummary = 'All tasks completed! 🎉'
  }

  const totalCost = totalDispatchCost + briefingCost
  const checksRun = ['kanban']
  if (dispatched.length > 0) checksRun.push('spawn')

  logHeartbeatRun(db, {
    summary: briefingSummary + (dispatched.length > 0 ? ` [${dispatched.length} agents spawned, $${totalDispatchCost.toFixed(4)}]` : ''),
    taskCount: updatedTasks.length,
    model: heartbeatModel,
    costUsd: totalCost,
    actionable: dispatched.length > 0 || updatedTasks.some((t) => t.priority === 'high'),
    checksRun,
  })

  return NextResponse.json({
    summary: briefingSummary,
    taskCount: updatedTasks.length,
    model: heartbeatModel,
    costUsd: totalCost,
    dispatched,
    autonomousMode: config.autonomousMode,
  })
}

// ─── GET /api/heartbeat — Quick health check ───

export async function GET() {
  const db = getDatabase()
  const counts = db.prepare(
    'SELECT status, COUNT(*) as count FROM dashboard_tasks GROUP BY status',
  ).all() as Array<{ status: string; count: number }>

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]))
  const config = getHeartbeatConfig(db)

  return NextResponse.json({
    ok: true,
    autonomousMode: config.autonomousMode,
    tasks: {
      backlog: byStatus['backlog'] ?? 0,
      'in-progress': byStatus['in-progress'] ?? 0,
      done: byStatus['done'] ?? 0,
    },
  })
}
