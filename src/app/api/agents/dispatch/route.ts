import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { spawnAgent } from '@/lib/agent-spawner'
import { getServerGatewayClient } from '@/lib/gateway/server-client'
import { syncAgentOutput } from '@/lib/agents/output-sync'
import { logGatewayChat } from '@/lib/llm-cost/tracker'

/**
 * POST /api/agents/dispatch — Dispatch a task to an agent.
 *
 * Primary path: OpenClaw gateway via GatewayClient (full agentic loop).
 * Fallback path: Embedded agent spawner (single-shot LLM call).
 *
 * Body: { taskId: string, agentId?: string, instruction?: string }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { taskId, agentId, instruction } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  const db = getDatabase()
  const startTime = Date.now()

  const task = db.prepare(
    'SELECT * FROM dashboard_tasks WHERE id = ?',
  ).get(taskId) as Record<string, unknown> | undefined

  if (!task) {
    return NextResponse.json({ error: `Task not found: ${taskId}` }, { status: 404 })
  }

  const quadrant = (task.quadrant as string) || 'industry'
  const resolvedAgentId = agentId || `gen-${quadrant}`
  const taskTitle = (task.title as string) || ''
  const taskDescription = (task.description as string) || taskTitle
  const message = instruction
    || `[${quadrant.toUpperCase()} TASK] ${taskTitle}\n\n${taskDescription}`
  const sessionId = `octavius-task-${taskId}`

  // ── Primary path: OpenClaw gateway ──
  const client = await getServerGatewayClient()

  if (client) {
    try {
      const res = await client.request('/api/sessions/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: resolvedAgentId,
          message,
          context: { task_id: taskId, quadrant, priority: task.priority },
        }),
      })

      if (!res.ok) throw new Error(`Gateway returned ${res.status}`)
      const data = await res.json() as { session_id: string }

      console.log(`[dispatch] Spawned gateway session: ${data.session_id} for task=${taskId}`)

      logGatewayChat({
        model: 'unknown',
        durationMs: Date.now() - startTime,
        sessionId: data.session_id,
        agentId: resolvedAgentId,
        status: 'success',
      })

      return NextResponse.json({
        taskId,
        agentId: resolvedAgentId,
        sessionId: data.session_id,
        status: 'dispatched',
        source: 'gateway',
      })
    } catch (err) {
      console.warn(`[dispatch] Gateway dispatch failed, falling back:`, (err as Error).message)
    }
  }

  // ── Fallback: Embedded agent spawner (single-shot, no tool use) ──
  console.log(`[dispatch] Using embedded fallback for task=${taskId}`)

  try {
    const result = await spawnAgent({ taskId, agentId: resolvedAgentId, instruction })

    syncAgentOutput(taskId, result.agentId, result.output, quadrant).catch(() => {})

    logGatewayChat({
      model: result.model,
      provider: result.provider,
      durationMs: Date.now() - startTime,
      sessionId,
      agentId: resolvedAgentId,
      status: 'success',
    })

    return NextResponse.json({
      taskId,
      agentId: result.agentId,
      output: result.output,
      action: result.action,
      newStatus: result.newStatus,
      model: result.model,
      provider: result.provider,
      source: 'embedded-fallback',
    })
  } catch (err) {
    console.error(`[dispatch] Embedded fallback failed:`, (err as Error).message)

    logGatewayChat({
      model: 'unknown',
      durationMs: Date.now() - startTime,
      sessionId,
      agentId: resolvedAgentId,
      status: 'error',
      error: (err as Error).message,
    })

    return NextResponse.json(
      { error: `Agent dispatch failed: ${(err as Error).message}`, taskId },
      { status: 500 },
    )
  }
}
