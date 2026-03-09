import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { callAndLog, MODELS } from '@/lib/openrouter'

/**
 * POST /api/heartbeat — Run a heartbeat analysis of pending kanban tasks.
 *
 * Uses a cheap OpenRouter model to analyze backlog/in-progress tasks
 * and return a prioritized summary with suggestions.
 *
 * Cost is automatically logged to the LLM cost tracker.
 */
export async function POST() {
  const db = getDatabase()

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
    return NextResponse.json({
      summary: 'No open tasks. Kanban board is clear! 🎉',
      taskCount: 0,
      model: null,
      costUsd: 0,
    })
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
        model: MODELS.cheap,
        maxTokens: 256,
        temperature: 0.3,
        label: 'heartbeat',
      },
    )

    return NextResponse.json({
      summary: result.text,
      taskCount: tasks.length,
      model: result.model,
      costUsd: result.costUsd,
      usage: result.usage,
    })
  } catch (err) {
    console.error('[heartbeat] OpenRouter call failed:', err)
    // Fallback: return task list without LLM analysis
    return NextResponse.json(
      {
        summary: `${tasks.length} open tasks. LLM analysis unavailable.`,
        taskCount: tasks.length,
        tasks: tasks.map((t) => ({
          title: t.title,
          priority: t.priority,
          status: t.status,
        })),
        error: String(err),
      },
      { status: 200 }, // Still 200 — degraded but usable
    )
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
