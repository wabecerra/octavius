import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { callAndLog, MODELS } from '@/lib/openrouter'
import { callLLM } from '@/lib/llm-caller'

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

function getAgentConfig(db: DB, agentId: string): { provider: string; model: string } {
  const row = db.prepare(
    'SELECT provider, model FROM agent_model_config WHERE agent_id = ?',
  ).get(agentId) as { provider: string; model: string } | undefined
  return row || { provider: 'openrouter', model: 'anthropic/claude-sonnet-4' }
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

function logTaskActivity(
  db: DB,
  entry: { taskId: string; agentId: string; action: string; details: string; model: string | null; costUsd: number },
) {
  try {
    db.prepare(
      `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(entry.taskId, entry.agentId, entry.action, entry.details.slice(0, 500), entry.model, entry.costUsd, new Date().toISOString())
  } catch { /* best-effort */ }
}

// ─── Agent Personas ───

const AGENT_PERSONAS: Record<string, string> = {
  'gen-industry': `You are an Industry specialist — expert in career strategy, product development, marketing, engineering, and business execution. You produce actionable deliverables: plans, research summaries, content drafts, technical designs, and strategic recommendations. Be thorough but concise. Format your output with clear sections and next steps.`,
  'gen-lifeforce': `You are a Lifeforce specialist — expert in health, wellness, fitness, nutrition, sleep, and mental health. You produce actionable health plans, workout routines, nutrition guides, and wellness recommendations. Be evidence-based and practical.`,
  'gen-fellowship': `You are a Fellowship specialist — expert in relationships, networking, community building, and social dynamics. You produce outreach plans, conversation starters, relationship maintenance strategies, and social engagement recommendations.`,
  'gen-essence': `You are an Essence specialist — expert in journaling, gratitude, mindfulness, purpose, creativity, and spiritual growth. You produce reflection prompts, gratitude exercises, creative briefs, and meaning-making frameworks.`,
}

const QUADRANT_AGENTS: Record<string, string> = {
  industry: 'gen-industry',
  lifeforce: 'gen-lifeforce',
  fellowship: 'gen-fellowship',
  essence: 'gen-essence',
}

// ─── Dispatch a single task to its agent ───

async function dispatchTask(
  db: DB,
  task: Record<string, unknown>,
): Promise<{ action: string; output: string; model: string; costUsd: number } | null> {
  const quadrant = (task.quadrant as string) || 'industry'
  const agentId = QUADRANT_AGENTS[quadrant] || 'gen-industry'
  const agentCfg = getAgentConfig(db, agentId)
  const systemPrompt = AGENT_PERSONAS[agentId] || AGENT_PERSONAS['gen-industry']

  const taskContext = [
    `## Task: ${task.title}`,
    task.description ? `\n### Current Context:\n${task.description}` : '',
    `\n### Details:`,
    `- Priority: ${task.priority}`,
    `- Status: ${task.status}`,
    `- Quadrant: ${task.quadrant || 'industry'}`,
    task.project ? `- Project: ${task.project}` : '',
    task.due_date ? `- Due: ${task.due_date}` : '',
  ].filter(Boolean).join('\n')

  const userPrompt = task.status === 'in-progress'
    ? `This task is IN PROGRESS. Review it and produce the next deliverable or progress update. If the work is substantially complete, say "TASK_COMPLETE" at the very end of your response.\n\n${taskContext}`
    : `This task is in the BACKLOG and needs to be started. Produce an initial deliverable — a plan, research summary, draft, or first concrete output.\n\n${taskContext}`

  try {
    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model: agentCfg.model, provider: agentCfg.provider, maxTokens: 2048, temperature: 0.4, label: `heartbeat-dispatch-${agentId}`, quadrant },
    )

    const now = new Date().toISOString()
    const isComplete = result.text.includes('TASK_COMPLETE')
    const agentOutput = result.text.replace('TASK_COMPLETE', '').trim()
    const newStatus = isComplete ? 'done' : (task.status === 'backlog' ? 'in-progress' : task.status)
    const action = isComplete ? 'completed' : (task.status === 'backlog' ? 'started' : 'progressed')

    // Append agent output to task description
    const existingDesc = (task.description as string) || ''
    const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const updatedDesc = existingDesc
      ? `${existingDesc}\n\n---\n**[${agentId} — ${ts}]**\n${agentOutput}`
      : agentOutput

    db.prepare(
      'UPDATE dashboard_tasks SET status = ?, description = ?, updated_at = ? WHERE id = ?',
    ).run(newStatus, updatedDesc, now, task.id)

    logTaskActivity(db, {
      taskId: task.id as string,
      agentId,
      action,
      details: agentOutput,
      model: result.model,
      costUsd: result.costUsd,
    })

    return { action, output: agentOutput, model: result.model, costUsd: result.costUsd }
  } catch (err) {
    console.error(`[heartbeat-dispatch] ${agentId} failed on task ${task.id}:`, err)
    return null
  }
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
  const dispatched: Array<{ taskId: string; title: string; action: string; agentId: string; costUsd: number }> = []
  let totalDispatchCost = 0

  // ── Phase 1: Autonomous dispatch (if enabled) ──
  if (config.autonomousMode) {
    const maxDispatch = config.maxDispatchPerRun

    // First: progress in-progress tasks
    for (const task of inProgress) {
      if (dispatched.length >= maxDispatch) break
      const result = await dispatchTask(db, task)
      if (result) {
        const quadrant = (task.quadrant as string) || 'industry'
        dispatched.push({
          taskId: task.id as string,
          title: task.title as string,
          action: result.action,
          agentId: QUADRANT_AGENTS[quadrant] || 'gen-industry',
          costUsd: result.costUsd,
        })
        totalDispatchCost += result.costUsd
      }
    }

    // Then: pull from backlog (high priority first)
    const highPriorityBacklog = backlog.filter((t) => t.priority === 'high')
    for (const task of highPriorityBacklog) {
      if (dispatched.length >= maxDispatch) break
      const result = await dispatchTask(db, task)
      if (result) {
        const quadrant = (task.quadrant as string) || 'industry'
        dispatched.push({
          taskId: task.id as string,
          title: task.title as string,
          action: result.action,
          agentId: QUADRANT_AGENTS[quadrant] || 'gen-industry',
          costUsd: result.costUsd,
        })
        totalDispatchCost += result.costUsd
      }
    }
  }

  // ── Phase 2: LLM briefing (always, uses cheap model) ──
  // Re-fetch tasks after dispatch may have changed statuses
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
      ? `\n\nAgent activity this cycle:\n${dispatched.map((d) => `- ${d.action}: "${d.title}" (${d.agentId}, $${d.costUsd.toFixed(4)})`).join('\n')}`
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
  if (dispatched.length > 0) checksRun.push('dispatch')

  logHeartbeatRun(db, {
    summary: briefingSummary + (dispatched.length > 0 ? ` [${dispatched.length} tasks dispatched, $${totalDispatchCost.toFixed(4)}]` : ''),
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
