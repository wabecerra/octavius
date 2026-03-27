import { NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logGatewayChat } from '@/lib/llm-cost/tracker'
import { getDatabase } from '@/lib/memory/db'

const execAsync = promisify(exec)
const OPENCLAW_PATH = process.env.OPENCLAW_PATH || 'openclaw'

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
