// src/lib/llm-cost/tracker.ts
// Auto-logging wrapper for LLM calls — instruments fetch calls and chat API responses

import { getDatabase } from '@/lib/memory/db'
import { LLMLoggingService } from './logging-service'
import { detectProvider } from './model-registry'
import type { CreateLogInput, LogStatus, LLMProvider } from './types'

const g = globalThis as unknown as { __llmTrackerService?: LLMLoggingService }

function getService(): LLMLoggingService {
  if (!g.__llmTrackerService) {
    g.__llmTrackerService = new LLMLoggingService(getDatabase())
  }
  return g.__llmTrackerService
}

/**
 * Log an LLM call from the OpenClaw gateway chat response metadata.
 * Called from /api/chat after a successful response.
 */
export function logGatewayChat(opts: {
  model?: string
  provider?: string
  durationMs?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  } | null
  sessionId?: string
  agentId?: string
  status?: LogStatus
  error?: string
}): string | null {
  try {
    const model = opts.model ?? 'unknown'
    const provider = (opts.provider as LLMProvider) ?? detectProvider(model)

    const input: CreateLogInput = {
      model,
      provider,
      session_id: opts.sessionId ?? 'octavius-chat',
      agent_id: opts.agentId ?? 'octavius-gateway',
      request_type: 'chat',
      streaming: false,
      tokens_input: opts.usage?.input_tokens ?? 0,
      tokens_output: opts.usage?.output_tokens ?? 0,
      tokens_cached_input: opts.usage?.cache_read_input_tokens ?? 0,
      latency_total_ms: opts.durationMs ?? 0,
      status: opts.status ?? 'success',
      error_message: opts.error,
      environment: 'production',
      tags: { source: 'gateway-chat' },
    }

    const record = getService().ingest(input)
    return record.id
  } catch (err) {
    console.error('[LLM Tracker] Failed to log gateway chat:', err)
    return null
  }
}

/**
 * Log a direct model API call (from agent-adapter).
 * Wraps the actual fetch with timing and logging.
 */
export async function trackedFetch(
  url: string,
  init: RequestInit,
  context: {
    model: string
    isLocal: boolean
    taskId?: string
    agentId?: string
    tier?: number
  },
): Promise<Response> {
  const startTime = Date.now()
  let status: LogStatus = 'success'
  let errorMessage: string | undefined
  let responseBody: Record<string, unknown> | null = null

  try {
    const res = await fetch(url, init)
    const elapsed = Date.now() - startTime

    if (!res.ok) {
      status = res.status === 429 ? 'rate_limited' : 'error'
      errorMessage = `HTTP ${res.status}: ${res.statusText}`

      // Log the failure
      logDirectCall({
        model: context.model,
        provider: context.isLocal ? 'local' : undefined,
        durationMs: elapsed,
        status,
        error: errorMessage,
        taskId: context.taskId,
        agentId: context.agentId,
        tier: context.tier,
      })

      return res
    }

    // Clone response to read body without consuming it
    const cloned = res.clone()
    try {
      responseBody = (await cloned.json()) as Record<string, unknown>
    } catch {
      // Non-JSON response
    }

    // Extract usage from response
    const usage = extractUsageFromResponse(responseBody, context.isLocal)

    logDirectCall({
      model: context.model,
      provider: context.isLocal ? 'local' : undefined,
      durationMs: elapsed,
      status: 'success',
      tokensInput: usage.input,
      tokensOutput: usage.output,
      taskId: context.taskId,
      agentId: context.agentId,
      tier: context.tier,
    })

    return res
  } catch (err) {
    const elapsed = Date.now() - startTime
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'))

    logDirectCall({
      model: context.model,
      provider: context.isLocal ? 'local' : undefined,
      durationMs: elapsed,
      status: isTimeout ? 'timeout' : 'error',
      error: err instanceof Error ? err.message : String(err),
      taskId: context.taskId,
      agentId: context.agentId,
      tier: context.tier,
    })

    throw err
  }
}

function logDirectCall(opts: {
  model: string
  provider?: string
  durationMs: number
  status: LogStatus
  error?: string
  tokensInput?: number
  tokensOutput?: number
  taskId?: string
  agentId?: string
  tier?: number
}): void {
  try {
    const input: CreateLogInput = {
      model: opts.model,
      provider: opts.provider ?? undefined,
      request_type: 'chat',
      streaming: false,
      tokens_input: opts.tokensInput ?? 0,
      tokens_output: opts.tokensOutput ?? 0,
      latency_total_ms: opts.durationMs,
      status: opts.status,
      error_message: opts.error,
      agent_id: opts.agentId ?? 'octavius-agent',
      environment: 'production',
      tags: {
        source: 'agent-adapter',
        ...(opts.taskId ? { task_id: opts.taskId } : {}),
        ...(opts.tier != null ? { tier: String(opts.tier) } : {}),
      },
    }

    getService().ingest(input)
  } catch (err) {
    console.error('[LLM Tracker] Failed to log direct call:', err)
  }
}

/**
 * Extract token usage from model API responses.
 */
function extractUsageFromResponse(
  body: Record<string, unknown> | null,
  isLocal: boolean,
): { input: number; output: number } {
  if (!body) return { input: 0, output: 0 }

  if (isLocal) {
    // Ollama: { eval_count, prompt_eval_count }
    return {
      input: (body.prompt_eval_count as number) ?? 0,
      output: (body.eval_count as number) ?? 0,
    }
  }

  // OpenAI-compatible: { usage: { prompt_tokens, completion_tokens } }
  const usage = body.usage as Record<string, number> | undefined
  if (usage) {
    return {
      input: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      output: usage.completion_tokens ?? usage.output_tokens ?? 0,
    }
  }

  return { input: 0, output: 0 }
}
