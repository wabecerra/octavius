import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logGatewayChat } from '@/lib/llm-cost/tracker'
import { getDatabase } from '@/lib/memory/db'
import { getGatewayBridge } from '@/lib/gateway/bridge'
import { isSlashCommand, parseCommand } from '@/lib/chat/commands'
import type { AgentEvent } from '@/lib/gateway/bridge-events'

const execAsync = promisify(exec)
const OPENCLAW_PATH = process.env.OPENCLAW_PATH || 'openclaw'
const ENABLE_WS_BRIDGE = process.env.ENABLE_WS_BRIDGE !== 'false' // default true

/** Strip ANSI escape codes from CLI output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/** Get the default chat model config from agent_model_config or fallback */
function getChatModelConfig(): { provider: string; model: string } {
  try {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT provider, model FROM agent_model_config WHERE agent_id = ?',
    ).get('octavius-chat') as { provider: string; model: string } | undefined
    return row || { provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' }
  } catch {
    return { provider: 'bedrock', model: 'amazon-bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0' }
  }
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
          response = `Bridge: ${bridge.status} | Agents: ${running} active | Queue: ${bridge.queueLength}`
        } else if (cmd.name === 'agents') {
          const fleet = bridge.getFleetSnapshot()
          response = fleet.map(a => `${a.id}: ${a.status}`).join('\n') || 'No agents tracked.'
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
              const result = await bridge.sendAgent({ message, sessionKey: 'agent:main' })
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
