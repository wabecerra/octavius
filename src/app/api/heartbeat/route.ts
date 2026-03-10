import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { callAndLog, MODELS } from '@/lib/openrouter'

/** Load the configured heartbeat model from SQLite, falling back to MODELS.cheap */
function getHeartbeatModel(db: ReturnType<typeof getDatabase>): string {
  try {
    const row = db.prepare("SELECT value FROM heartbeat_config WHERE key = 'model'").get() as { value: string } | undefined
    return row?.value || MODELS.cheap
  } catch {
    return MODELS.cheap
  }
}

/** Log a heartbeat run to the history table */
function logHeartbeatRun(
  db: ReturnType<typeof getDatabase>,
  run: { summary: string; taskCount: number; model: string | null; costUsd: number; actionable: boolean; checksRun: string[] },
) {
  try {
    db.prepare(
      `INSERT INTO heartbeat_runs (timestamp, summary, task_count, model, cost_usd, actionable, checks_run)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      new Date().toISOString(),
      run.summary,
      run.taskCount,
      run.model,
      run.costUsd,
      run.actionable ? 1 : 0,
      JSON.stringify(run.checksRun),
    )
  } catch {
    // Non-fatal — history logging is best-effort
  }
}

/**
 * POST /api/heartbeat — Run a heartbeat analysis of pending kanban tasks.
 *
 * Uses a cheap OpenRouter model to analyze backlog/in-progress tasks
 * and return a prioritized summary with suggestions.
 *
 * Cost is automatically logged to the LLM cost tracker.
 * Each run is also logged to heartbeat_runs for history display.
 */
export async function POST() {
  const db = getDatabase()
  const model = getHeartbeatModel(db)

  // Fetch open tasks
  const tasks = db
    .prepare(
      `SELECT id, title, description, priority, status, quadrant, project, due_date, created_at
       FROM dashboard_tasks
       WHERE status IN ('backlog', 'in-progress')
       ORDER BY
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at ASC`,
    )
    .all() as Array<Record<string, unknown>>

  if (tasks.length === 0) {
    const result = {
      summary: 'No open tasks. Kanban board is clear! 🎉',
      taskCount: 0,
      model: null,
      costUsd: 0,
    }
    logHeartbeatRun(db, { ...result, actionable: false, checksRun: ['kanban'] })
    return NextResponse.json(result)
  }

  // Build a compact task list for the LLM
  const taskList = tasks
    .map((t, i) => {
      const parts = [`${i + 1}. [${t.priority}] ${t.title}`]
      if (t.status === 'in-progress') parts.push('(IN PROGRESS)')
      if (t.quadrant) parts.push(`[${t.quadrant}]`)
      if (t.project) parts.push(`#${t.project}`)
      if (t.due_date) parts.push(`due:${t.due_date}`)
      return parts.join(' ')
    })
    .join('\n')

  const systemPrompt = `You are a productivity assistant reviewing a kanban board. Be concise and actionable. Use 2-4 sentences max. Highlight what should be worked on today based on priority and status. If anything is overdue or high-priority but still in backlog, flag it.`

  const userPrompt = `Here are the open tasks:\n\n${taskList}\n\nGive a quick daily briefing.`

  try {
    const result = await callAndLog(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model,
        maxTokens: 256,
        temperature: 0.3,
        label: 'heartbeat',
      },
    )

    const response = {
      summary: result.text,
      taskCount: tasks.length,
      model: result.model,
      costUsd: result.costUsd,
      usage: result.usage,
    }

    logHeartbeatRun(db, {
      summary: result.text,
      taskCount: tasks.length,
      model: result.model,
      costUsd: result.costUsd,
      actionable: tasks.some((t) => t.priority === 'high' || t.status === 'in-progress'),
      checksRun: ['kanban'],
    })

    return NextResponse.json(response)
  } catch (err) {
    console.error('[heartbeat] OpenRouter call failed:', err)

    const fallback = {
      summary: `${tasks.length} open tasks. LLM analysis unavailable.`,
      taskCount: tasks.length,
      tasks: tasks.map((t) => ({
        title: t.title,
        priority: t.priority,
        status: t.status,
      })),
      error: String(err),
    }

    logHeartbeatRun(db, {
      summary: fallback.summary,
      taskCount: tasks.length,
      model: null,
      costUsd: 0,
      actionable: false,
      checksRun: ['kanban'],
    })

    return NextResponse.json(fallback, { status: 200 })
  }
}

/**
 * GET /api/heartbeat — Quick health check / task count.
 */
export async function GET() {
  const db = getDatabase()
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) as count FROM dashboard_tasks GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]))

  return NextResponse.json({
    ok: true,
    tasks: {
      backlog: byStatus['backlog'] ?? 0,
      'in-progress': byStatus['in-progress'] ?? 0,
      done: byStatus['done'] ?? 0,
    },
  })
}
