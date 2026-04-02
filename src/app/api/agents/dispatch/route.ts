import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { spawnAgent } from '@/lib/agent-spawner'
import { getGatewayBridge } from '@/lib/gateway/bridge'
import { syncAgentOutput } from '@/lib/agents/output-sync'
import { logGatewayChat } from '@/lib/llm-cost/tracker'
import { buildEnvironmentSnapshot, formatSnapshotForPrompt } from '@/lib/gateway/env-bootstrap'
import { getContextCache, CACHE_TTL } from '@/lib/gateway/context-cache'
import { getOrCreateHarnessSession, removeHarnessSession } from '@/lib/harness/session-manager'

/** Map agent IDs (gen-industry, specialist-coder:task123) to scope keys */
function agentIdToType(agentId: string): string {
  if (agentId === 'orchestrator') return 'orchestrator'
  if (agentId.startsWith('gen-')) return 'generalist'
  if (agentId.startsWith('specialist-')) return agentId.split(':')[0] // specialist-coder:taskId -> specialist-coder
  return 'generalist'
}

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

  // ── Log "started" so Nerve Center shows agent as active immediately ──
  db.prepare(
    `INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp)
     VALUES (?, ?, 'started', ?, ?)`,
  ).run(taskId, resolvedAgentId, `Dispatching: ${taskTitle}`.slice(0, 500), new Date().toISOString())

  // Update task status to in-progress
  db.prepare('UPDATE dashboard_tasks SET status = ?, updated_at = ? WHERE id = ?')
    .run('in-progress', new Date().toISOString(), taskId)

  // ── Primary path: OpenClaw gateway via Bridge ──
  const bridge = getGatewayBridge()

  if (bridge.status === 'CONNECTED') {
    // Create harness session for permission/scope/token tracking (side-effect: registers session + begins trace)
    const agentType = agentIdToType(resolvedAgentId)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const harnessSession = getOrCreateHarnessSession(
      `subagent:${resolvedAgentId}`, resolvedAgentId, agentType,
    )

    try {
      // Inject cached environment context so agent has full awareness upfront
      const cache = getContextCache()
      const { content: envContext } = cache.getOrCompute(
        'env-snapshot',
        CACHE_TTL.ENVIRONMENT_SNAPSHOT,
        () => formatSnapshotForPrompt(buildEnvironmentSnapshot(bridge, agentIdToType(resolvedAgentId))),
      )
      const enrichedMessage = `${envContext}\n\n---\n\n${message}`

      const res = await bridge.sendAgent({
        message: enrichedMessage,
        sessionKey: `subagent:${resolvedAgentId}`,
        timeout: 300_000,
      })

      const payload = res.payload as Record<string, unknown>
      console.log(`[dispatch] Bridge agent call complete for task=${taskId}`)
      removeHarnessSession(`subagent:${resolvedAgentId}`)

      logGatewayChat({
        model: 'orchestrator',
        durationMs: Date.now() - startTime,
        sessionId: sessionId,
        agentId: resolvedAgentId,
        status: 'success',
      })

      return NextResponse.json({
        taskId,
        agentId: resolvedAgentId,
        output: payload?.summary ?? '',
        sessionId,
        status: 'dispatched',
        source: 'gateway',
      })
    } catch (err) {
      console.warn(`[dispatch] Bridge dispatch failed, falling back:`, (err as Error).message)
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
