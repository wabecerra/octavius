import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logGatewayChat } from '@/lib/llm-cost/tracker'
import { getDatabase } from '@/lib/memory/db'
import { getGatewayBridge } from '@/lib/gateway/bridge'
import { isSlashCommand, parseCommand } from '@/lib/chat/commands'
import type { AgentEvent } from '@/lib/gateway/bridge-events'
import { buildEnvironmentSnapshot, formatSnapshotForPrompt } from '@/lib/gateway/env-bootstrap'
import { getContextCache, CACHE_TTL } from '@/lib/gateway/context-cache'
import { getChatFallbackModel } from '@/lib/models'

const execAsync = promisify(exec)
const OPENCLAW_PATH = process.env.OPENCLAW_PATH || 'openclaw'
const ENABLE_WS_BRIDGE = process.env.ENABLE_WS_BRIDGE !== 'false' // default true

/** Strip ANSI escape codes from CLI output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Get the default chat model config from agent_model_config or env-aware fallback */
function getChatModelConfig(): { provider: string; model: string } {
  try {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT provider, model FROM agent_model_config WHERE agent_id = ?',
    ).get('octavius-chat') as { provider: string; model: string } | undefined
    if (row) return row
  } catch {
    // DB unavailable
  }
  // Env-aware fallback from centralized model registry
  return getChatFallbackModel()
}

/**
 * POST /api/chat — Send a message through the OpenClaw agent via CLI.
 * Falls back to embedded LLM call if CLI is unavailable.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { message } = body

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const startTime = Date.now()

  // ── Slash command handling ──
  if (isSlashCommand(message)) {
    const cmd = parseCommand(message)
    if (cmd) {
      try {
        const bridge = getGatewayBridge()
        // For now, handle simple commands inline since executeCommand is a TODO stub
        let response = `Command /${cmd.name} received.`
        if (cmd.name === 'status') {
          const fleet = bridge.getFleetSnapshot()
          const running = fleet.filter(a => a.status === 'running').length
          const cacheStats = getContextCache().getStats()
          response = `Bridge: ${bridge.status} | Agents: ${running} active | Queue: ${bridge.queueLength}\nCache: ${cacheStats.entries} entries, ${(cacheStats.hitRate * 100).toFixed(0)}% hit rate, ~${cacheStats.totalTokenEstimate} tokens cached`
        } else if (cmd.name === 'agents') {
          const fleet = bridge.getFleetSnapshot()
          response = fleet.map(a => `${a.id}: ${a.status}`).join('\n') || 'No agents tracked.'
        } else if (cmd.name === 'approve') {
          const { confirmOperation: confirm } = await import('@/lib/gateway/confirmation-gate')
          const id = cmd.args[0]
          if (!id) {
            const { getPendingConfirmations } = await import('@/lib/gateway/confirmation-gate')
            const pending = getPendingConfirmations()
            response = pending.length > 0
              ? pending.map(p => `${p.id.slice(0, 8)}... — ${p.description}`).join('\n')
              : 'No pending confirmations.'
          } else {
            const result = confirm(id)
            response = result.confirmed
              ? `Confirmed: ${result.operation}`
              : 'Confirmation expired or not found.'
          }
        } else if (cmd.name === 'reject') {
          const { rejectConfirmation: reject } = await import('@/lib/gateway/confirmation-gate')
          const id = cmd.args[0]
          if (!id) {
            response = 'Usage: /reject <confirmation-id>'
          } else {
            const removed = reject(id)
            response = removed ? 'Confirmation rejected.' : 'Confirmation not found.'
          }
        } else if (cmd.name === 'permissions') {
          const { AGENT_DEFAULT_PERMISSIONS } = await import('@/lib/harness/permissions')
          const { PERMISSION_LABELS } = await import('@/lib/harness/types')
          response = Object.entries(AGENT_DEFAULT_PERMISSIONS)
            .map(([type, level]) => `${type}: **${PERMISSION_LABELS[level]}**`)
            .join('\n')
        } else if (cmd.name === 'scope') {
          const { resolveToolScope } = await import('@/lib/harness/tool-scopes')
          const agentType = cmd.args[0] || 'orchestrator'
          const tools = resolveToolScope(agentType)
          response = tools.length > 0
            ? `**${agentType}** (${tools.length} tools):\n${tools.map(t => `  ${t}`).join('\n')}`
            : `No scope defined for '${agentType}'.`
        } else if (cmd.name === 'hooks') {
          const { getHookPipeline } = await import('@/lib/harness/hooks')
          const hooks = getHookPipeline().listHooks()
          response = hooks.map(h => `[${h.phase}] ${h.name} (priority ${h.priority})`).join('\n')
        } else if (cmd.name === 'sessions') {
          const { getActiveSessions } = await import('@/lib/harness/session-manager')
          const { PERMISSION_LABELS } = await import('@/lib/harness/types')
          const sessions = getActiveSessions()
          response = sessions.length > 0
            ? sessions.map(s => `${s.agentId} [${PERMISSION_LABELS[s.permissionLevel]}] — ${s.tokenUsed}/${s.tokenBudget} tokens`).join('\n')
            : 'No active harness sessions.'
        } else if (cmd.name === 'evolve') {
          const { runProposer } = await import('@/lib/harness/proposer')
          const days = cmd.args[0] ? Number(cmd.args[0]) : 1
          response = `Running proposer (analyzing last ${days} day${days > 1 ? 's' : ''})...`
          // Fire-and-forget — result will appear in /api/harness/policies
          runProposer('manual', { sinceDays: days }).then(run => {
            console.log(`[proposer] Completed: ${run.proposalsGenerated} proposals, ${run.tracesAnalyzed} traces analyzed`)
          }).catch(err => {
            console.error('[proposer] Failed:', (err as Error).message)
          })
        } else if (cmd.name === 'traces') {
          const { queryTraces } = await import('@/lib/harness/trace-store')
          const { traces, total } = queryTraces({ limit: 10 })
          response = total > 0
            ? `${total} traces total. Recent:\n${traces.map(t => `${t.traceId.slice(0, 8)}... ${t.agentType} [${t.outcome}] ${t.taskTitle || 'N/A'}`).join('\n')}`
            : 'No execution traces recorded yet.'
        } else if (cmd.name === 'policies') {
          const { listPolicies } = await import('@/lib/harness/policy-store')
          const policies = listPolicies({ limit: 10 })
          response = policies.length > 0
            ? policies.map(p => `[${p.status}] ${p.policyType} → ${p.target}: ${p.reason.slice(0, 80)}`).join('\n')
            : 'No evolution policies yet. Run /evolve to generate proposals.'
        }
        return NextResponse.json({
          response,
          source: 'command',
          meta: { durationMs: Date.now() - startTime },
        })
      } catch (err) {
        return NextResponse.json({
          response: `Command failed: ${(err as Error).message}`,
          source: 'command',
          meta: { durationMs: Date.now() - startTime },
        })
      }
    }
  }

  // ── Primary: WebSocket streaming via GatewayBridge ──
  if (ENABLE_WS_BRIDGE) {
    const bridge = getGatewayBridge()
    if (bridge.status === 'CONNECTED') {
      try {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          async start(controller) {
            function send(event: string, data: unknown) {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
            }

            function onAgentEvent(event: AgentEvent) {
              try { send(event.type, event) } catch { /* stream closed */ }
            }
            bridge.on('agent-event', onAgentEvent)

            try {
              // Inject cached environment context so agent doesn't waste turns exploring
              const cache = getContextCache()
              const { content: envContext } = cache.getOrCompute(
                'env-snapshot',
                CACHE_TTL.ENVIRONMENT_SNAPSHOT,
                () => formatSnapshotForPrompt(buildEnvironmentSnapshot(bridge)),
              )
              const enrichedMessage = `${envContext}\n\n---\n\n**User message:** ${message}`

              const result = await bridge.sendAgent({ message: enrichedMessage, sessionKey: 'agent:main' })
              const payload = result.payload as Record<string, unknown>
              send('done', {
                response: payload?.summary ?? '',
                source: 'gateway',
                meta: { durationMs: Date.now() - startTime },
              })

              logGatewayChat({
                model: 'orchestrator',
                durationMs: Date.now() - startTime,
                sessionId: 'octavius-chat',
                agentId: 'orchestrator',
                status: 'success',
              })
            } catch (err) {
              send('error', { error: (err as Error).message })
            } finally {
              bridge.removeListener('agent-event', onAgentEvent)
              controller.close()
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
          },
        })
      } catch (err) {
        console.warn('[chat] Bridge streaming failed, falling back to CLI:', (err as Error).message)
        // Fall through to existing CLI path below
      }
    }
  }

  try {
    // Use openclaw CLI agent command
    const command = `cd "${OPENCLAW_PATH}" && node openclaw.mjs agent --session-id main --message ${JSON.stringify(message)} --json --timeout 30`
    console.log('[Chat API] Running OpenClaw agent...')

    const { stdout, stderr } = await execAsync(command, {
      timeout: 40000, // 40s total timeout
      encoding: 'utf8',
      env: { ...process.env, HOME: process.env.HOME || '/home/wabo' },
      maxBuffer: 1024 * 1024, // 1MB to handle large JSON output
    })

    if (stderr) {
      console.log('[Chat API] Stderr:', stderr.slice(0, 200))
    }

    // Strip ANSI codes and parse the JSON response from the CLI
    const cleanOutput = stripAnsi(stdout.trim())
    const result = JSON.parse(cleanOutput)

    if (result.status !== 'ok') {
      throw new Error(`Agent failed: ${result.summary || 'unknown error'}`)
    }

    // Extract the response text from the payloads
    const responseText = result.result?.payloads?.[0]?.text || '(no response)'
    const meta = result.result?.meta?.agentMeta ?? {}
    const durationMs = result.result?.meta?.durationMs ?? (Date.now() - startTime)

    console.log('[Chat API] Agent response:', responseText.slice(0, 200))

    // ── Log to cost tracker ──
    logGatewayChat({
      model: meta.model ?? 'unknown',
      provider: meta.provider ?? undefined,
      durationMs,
      usage: meta.usage ?? null,
      sessionId: 'octavius-chat',
      agentId: 'octavius-gateway',
      status: 'success',
    })

    return NextResponse.json({
      response: responseText,
      source: 'gateway',
      meta: {
        model: meta.model || 'unknown',
        provider: meta.provider || 'unknown',
        durationMs,
        usage: meta.usage || null,
      },
    })

  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string }
    console.error('[Chat API] CLI failed:', error.message)
    if (error.stderr) console.error('[Chat API] stderr:', error.stderr.slice(0, 500))

    // Try to parse partial JSON response if available
    if (error.stdout) {
      try {
        const partialResult = JSON.parse(stripAnsi(error.stdout))
        if (partialResult.result?.payloads?.[0]?.text) {
          return NextResponse.json({
            response: partialResult.result.payloads[0].text,
            source: 'gateway-partial',
            warning: 'Request completed but timed out waiting for full response',
          })
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Fallback: use intent classifier → task bridge pipeline
    console.log('[Chat API] Falling back to intent classifier')
    try {
      const { classifyIntent } = await import('@/lib/chat/intent-classifier')
      const { bridgeTaskToAgent } = await import('@/lib/chat/task-bridge')

      // Parse conversation history from request (if provided)
      const history = body.history as Array<{ role: 'user' | 'assistant'; content: string }> | undefined

      // Reuse getChatModelConfig for intent classification
      const config = getChatModelConfig()
      const intent = await classifyIntent(message, history, config)
      const durationMs = Date.now() - startTime

      if (intent.intent === 'create_task' && intent.task) {
        // Actionable request → create task + dispatch agent
        const bridge = await bridgeTaskToAgent(intent.task)

        logGatewayChat({
          model: 'intent-classifier',
          durationMs,
          sessionId: 'octavius-chat',
          agentId: bridge.agentId || 'octavius-orchestrator',
          status: bridge.success ? 'success' : 'error',
        })

        return NextResponse.json({
          response: bridge.message,
          source: 'orchestrator',
          action: {
            type: 'task_created',
            taskId: bridge.taskId,
            agentId: bridge.agentId,
            dispatched: bridge.dispatched,
            title: intent.task.title,
            quadrant: intent.task.quadrant,
          },
          meta: { durationMs },
        })
      }

      // Conversational response
      logGatewayChat({
        model: 'intent-classifier',
        durationMs,
        sessionId: 'octavius-chat',
        agentId: 'octavius-embedded',
        status: 'success',
      })

      return NextResponse.json({
        response: intent.response || 'I\'m not sure how to help with that.',
        source: 'embedded',
        meta: { durationMs },
      })
    } catch (fallbackErr: unknown) {
      const fbError = fallbackErr as Error
      console.error('[Chat API] Intent classifier failed:', fbError.message)
      const durationMs = Date.now() - startTime

      logGatewayChat({
        model: 'unknown',
        durationMs,
        sessionId: 'octavius-chat',
        agentId: 'octavius-embedded',
        status: 'error',
        error: fbError.message,
      })

      return NextResponse.json({
        response: 'Sorry, I couldn\'t process your message right now. Please try again later.',
        source: 'error',
      }, { status: 500 })
    }
  }
}
