import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { callLLM } from '@/lib/llm-caller'

/**
 * POST /api/agents/dispatch — Dispatch a task to a generalist agent for execution.
 *
 * The agent receives the task context and produces actionable output:
 * research, plans, content, recommendations, etc.
 *
 * Body: { taskId: string, agentId?: string, instruction?: string }
 *
 * The agent's configured model is used (from agent_model_config).
 * Results are stored in the task description and activity log.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { taskId, agentId, instruction } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  const db = getDatabase()

  // Load the task
  const task = db.prepare(
    'SELECT * FROM dashboard_tasks WHERE id = ?',
  ).get(taskId) as Record<string, unknown> | undefined

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // Determine which agent handles this task
  const quadrant = (task.quadrant as string) || 'industry'
  const QUADRANT_AGENTS: Record<string, string> = {
    industry: 'gen-industry',
    lifeforce: 'gen-lifeforce',
    fellowship: 'gen-fellowship',
    essence: 'gen-essence',
  }
  const resolvedAgentId = agentId || QUADRANT_AGENTS[quadrant] || 'gen-industry'

  // Load agent's model config
  const agentConfig = db.prepare(
    'SELECT * FROM agent_model_config WHERE agent_id = ?',
  ).get(resolvedAgentId) as { provider: string; model: string } | undefined

  const provider = agentConfig?.provider || 'openrouter'
  const model = agentConfig?.model || 'anthropic/claude-sonnet-4'

  // Build the agent prompt based on quadrant
  const AGENT_PERSONAS: Record<string, string> = {
    'gen-industry': `You are an Industry specialist — expert in career strategy, product development, marketing, engineering, and business execution. You produce actionable deliverables: plans, research summaries, content drafts, technical designs, and strategic recommendations. Be thorough but concise. Format your output with clear sections and next steps.`,
    'gen-lifeforce': `You are a Lifeforce specialist — expert in health, wellness, fitness, nutrition, sleep, and mental health. You produce actionable health plans, workout routines, nutrition guides, and wellness recommendations. Be evidence-based and practical.`,
    'gen-fellowship': `You are a Fellowship specialist — expert in relationships, networking, community building, and social dynamics. You produce outreach plans, conversation starters, relationship maintenance strategies, and social engagement recommendations.`,
    'gen-essence': `You are an Essence specialist — expert in journaling, gratitude, mindfulness, purpose, creativity, and spiritual growth. You produce reflection prompts, gratitude exercises, creative briefs, and meaning-making frameworks.`,
  }

  const systemPrompt = AGENT_PERSONAS[resolvedAgentId] || AGENT_PERSONAS['gen-industry']

  const taskContext = [
    `## Task: ${task.title}`,
    task.description ? `\n### Current Description:\n${task.description}` : '',
    `\n### Details:`,
    `- Priority: ${task.priority}`,
    `- Status: ${task.status}`,
    `- Quadrant: ${task.quadrant || 'industry'}`,
    task.project ? `- Project: ${task.project}` : '',
    task.due_date ? `- Due: ${task.due_date}` : '',
    instruction ? `\n### Special Instructions:\n${instruction}` : '',
  ].filter(Boolean).join('\n')

  const userPrompt = task.status === 'in-progress'
    ? `This task is IN PROGRESS. Review it and produce the next deliverable or progress update. If the work is complete, say "TASK_COMPLETE" at the end.\n\n${taskContext}`
    : `This task is in the BACKLOG and needs to be started. Produce an initial deliverable — a plan, research summary, draft, or first concrete output. Move it forward.\n\n${taskContext}`

  try {
    const result = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model,
        provider,
        maxTokens: 2048,
        temperature: 0.4,
        label: `dispatch-${resolvedAgentId}`,
        quadrant,
      },
    )

    const now = new Date().toISOString()
    const isComplete = result.text.includes('TASK_COMPLETE')

    // Update task: move backlog → in-progress, or in-progress → done if complete
    const newStatus = isComplete ? 'done' : (task.status === 'backlog' ? 'in-progress' : task.status)

    // Append agent output to task description
    const existingDesc = (task.description as string) || ''
    const agentOutput = result.text.replace('TASK_COMPLETE', '').trim()
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const updatedDesc = existingDesc
      ? `${existingDesc}\n\n---\n**[${resolvedAgentId} — ${timestamp}]**\n${agentOutput}`
      : agentOutput

    db.prepare(
      'UPDATE dashboard_tasks SET status = ?, description = ?, updated_at = ? WHERE id = ?',
    ).run(newStatus, updatedDesc, now, taskId)

    // Log activity
    db.prepare(
      `INSERT INTO task_activity_log (task_id, agent_id, action, details, model, cost_usd, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      taskId,
      resolvedAgentId,
      isComplete ? 'completed' : (task.status === 'backlog' ? 'started' : 'progressed'),
      agentOutput.slice(0, 500), // truncate for log
      result.model,
      result.costUsd,
      now,
    )

    return NextResponse.json({
      taskId,
      agentId: resolvedAgentId,
      model: result.model,
      action: isComplete ? 'completed' : (task.status === 'backlog' ? 'started' : 'progressed'),
      newStatus,
      output: agentOutput,
      costUsd: result.costUsd,
      usage: result.usage,
    })
  } catch (err) {
    console.error(`[dispatch] Agent ${resolvedAgentId} failed:`, err)
    return NextResponse.json(
      { error: `Agent dispatch failed: ${err}`, taskId, agentId: resolvedAgentId },
      { status: 500 },
    )
  }
}
