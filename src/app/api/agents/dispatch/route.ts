import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { getDatabase } from '@/lib/memory/db'
import { logGatewayChat } from '@/lib/llm-cost/tracker'
import { spawnAgent } from '@/lib/agent-spawner'

const execAsync = promisify(exec)
const OPENCLAW_PATH = process.env.OPENCLAW_PATH || 'openclaw'

/** Strip ANSI escape codes from CLI output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * POST /api/agents/dispatch — Dispatch a task to an agent via OpenClaw CLI.
 *
 * Routes all agent work through the OpenClaw gateway so we get proper
 * session management, tool access, and telemetry. Falls back to embedded
 * mode (--local) if the gateway is unreachable — OpenClaw handles that
 * internally.
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

  // Load the task from SQLite
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

  // Build the message for OpenClaw
  const message = instruction
    || `[${quadrant.toUpperCase()} TASK] ${taskTitle}\n\n${taskDescription}`

  // Use a per-task session so OpenClaw tracks it independently
  const sessionId = `octavius-task-${taskId}`

  try {
    const escapedMessage = JSON.stringify(message)
    const agentFlag = resolvedAgentId ? ` --agent ${resolvedAgentId}` : ''
    const command = `cd "${OPENCLAW_PATH}" && node openclaw.mjs agent --session-id ${sessionId}${agentFlag} --message ${escapedMessage} --json --timeout 120`

    console.log(`[dispatch] Spawning via OpenClaw: agent=${resolvedAgentId}, task=${taskId}`)

    const { stdout, stderr } = await execAsync(command, {
      timeout: 130_000,
      encoding: 'utf8',
    })

    if (stderr) {
      console.log('[dispatch] Stderr:', stderr.slice(0, 300))
    }

    // Strip ANSI codes and parse the JSON response
    const result = JSON.parse(stripAnsi(stdout.trim()))

    if (result.status !== 'ok') {
      throw new Error(`Agent failed: ${result.summary || 'unknown error'}`)
    }

    const responseText = result.result?.payloads?.[0]?.text || '(no response)'
    const meta = result.result?.meta?.agentMeta ?? {}
    const durationMs = result.result?.meta?.durationMs ?? (Date.now() - startTime)

    console.log(`[dispatch] Agent response (${durationMs}ms):`, responseText.slice(0, 200))

    // Update the task in SQLite with the agent output
    const now = new Date().toISOString()
    const existingDesc = (task.description as string) || ''
    const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const updatedDesc = existingDesc
      ? `${existingDesc}\n\n---\n**[${resolvedAgentId} — ${ts}]**\n${responseText}`
      : responseText

    const isComplete = responseText.includes('TASK_COMPLETE')
    const newStatus = isComplete ? 'done' : 'in-progress'

    db.prepare(
      'UPDATE dashboard_tasks SET status = ?, description = ?, updated_at = ? WHERE id = ?',
    ).run(newStatus, updatedDesc, now, taskId)

    // Check for specialist spawn request — cascade via agent-spawner
    const spawnMatch = responseText.match(/SPAWN_SPECIALIST:\s*(\S+)\nINSTRUCTION:\s*(.+)/m)
    if (spawnMatch) {
      const [, specialistId, specialistInstruction] = spawnMatch
      console.log(`[dispatch] Generalist ${resolvedAgentId} requested specialist ${specialistId}`)
      // Fire-and-forget: specialist runs async, appends output to task description
      Promise.resolve().then(() => {
        spawnAgent({
          taskId,
          agentId: specialistId,
          instruction: `Called by ${resolvedAgentId}: ${specialistInstruction}`,
        }).catch(err => console.error(`[dispatch] Specialist cascade failed:`, err))
      })
    }

    // Log to cost tracker
    logGatewayChat({
      model: meta.model ?? 'unknown',
      provider: meta.provider ?? undefined,
      durationMs,
      usage: meta.usage ?? null,
      sessionId,
      agentId: resolvedAgentId,
      status: 'success',
    })

    return NextResponse.json({
      taskId,
      agentId: resolvedAgentId,
      output: responseText,
      action: isComplete ? 'completed' : 'progressed',
      newStatus,
      model: meta.model || 'unknown',
      provider: meta.provider || 'unknown',
      source: 'openclaw',
    })

  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string }
    const durationMs = Date.now() - startTime
    console.error(`[dispatch] OpenClaw CLI failed (${durationMs}ms):`, error.message)

    // Try to salvage partial output from CLI
    if (error.stdout) {
      try {
        const partial = JSON.parse(stripAnsi(error.stdout))
        if (partial.result?.payloads?.[0]?.text) {
          const partialText = partial.result.payloads[0].text
          const now = new Date().toISOString()
          db.prepare(
            'UPDATE dashboard_tasks SET description = description || ?, updated_at = ? WHERE id = ?',
          ).run(`\n\n---\n**[${resolvedAgentId} — partial]**\n${partialText}`, now, taskId)

          return NextResponse.json({
            taskId,
            agentId: resolvedAgentId,
            output: partialText,
            action: 'progressed',
            newStatus: 'in-progress',
            source: 'openclaw-partial',
            warning: 'Timed out but got partial response',
          })
        }
      } catch { /* ignore parse errors */ }
    }

    // Fallback: use embedded agent spawner (bypasses OpenClaw CLI)
    console.log(`[dispatch] Falling back to embedded agent spawner for task=${taskId}`)
    try {
      const spawnResult = await spawnAgent({
        taskId,
        agentId: resolvedAgentId,
        instruction,
      })

      logGatewayChat({
        model: spawnResult.model,
        provider: spawnResult.provider,
        durationMs: Date.now() - startTime,
        usage: null,
        sessionId,
        agentId: resolvedAgentId,
        status: 'success',
      })

      return NextResponse.json({
        taskId,
        agentId: spawnResult.agentId,
        output: spawnResult.output,
        action: spawnResult.action,
        newStatus: spawnResult.newStatus,
        model: spawnResult.model,
        provider: spawnResult.provider,
        source: 'embedded-fallback',
      })
    } catch (fallbackErr: unknown) {
      const fbError = fallbackErr as Error
      console.error(`[dispatch] Embedded fallback also failed:`, fbError.message)

      logGatewayChat({
        model: 'unknown',
        durationMs: Date.now() - startTime,
        sessionId,
        agentId: resolvedAgentId,
        status: 'error',
        error: fbError.message,
      })

      return NextResponse.json(
        { error: `Agent dispatch failed: ${fbError.message}`, taskId, agentId: resolvedAgentId },
        { status: 500 },
      )
    }
  }
}
