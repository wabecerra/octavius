/**
 * OpenRouter client for Octavius — used for cheap LLM calls (heartbeats,
 * task summaries, light reasoning). Bedrock/OpenClaw remains the primary
 * inference path for the main agent.
 *
 * Every call is logged to the LLM cost tracker automatically.
 */

// ─── Types ───

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenRouterOptions {
  /** Model slug. Defaults to a cheap model. */
  model?: string
  /** Max completion tokens. */
  maxTokens?: number
  /** Temperature (0-2). */
  temperature?: number
  /** Restrict auto-router to these model patterns. */
  allowedModels?: string[]
}

export interface OpenRouterUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost?: number
  cost_details?: {
    upstream_inference_cost?: number
    upstream_inference_prompt_cost?: number
    upstream_inference_completions_cost?: number
  }
}

export interface OpenRouterResponse {
  id: string
  model: string
  choices: {
    message: { role: string; content: string }
    finish_reason: string
  }[]
  usage: OpenRouterUsage
  created: number
}

// ─── Config ───

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/** Tiered model defaults — cheapest first */
export const MODELS = {
  /** Near-free: Qwen3-235B MoE ~$0.07/$0.10 per M tokens */
  cheap: 'qwen/qwen3-235b-a22b-2507',
  /** Free router — completely free, low rate limits */
  free: 'openrouter/free',
  /** Auto router — NotDiamond picks the best model */
  auto: 'openrouter/auto',
  /** Qwen3 30B — ultra-cheap for simple tasks */
  tiny: 'qwen/qwen3-30b-a3b-instruct-2507',
} as const

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set in environment')
  return key
}

// ─── Core call ───

export async function chatCompletion(
  messages: OpenRouterMessage[],
  opts: OpenRouterOptions = {},
): Promise<OpenRouterResponse> {
  const model = opts.model ?? MODELS.cheap
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
  }
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.allowedModels) {
    body.plugins = [{ id: 'auto-router', allowed_models: opts.allowedModels }]
  }

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
      'X-OpenRouter-Title': 'Octavius',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const data = (await res.json()) as OpenRouterResponse
  return data
}

// ─── Convenience wrappers ───

/**
 * Simple single-prompt completion. Returns just the text.
 * Automatically picks the cheapest model.
 */
export async function ask(
  prompt: string,
  opts: OpenRouterOptions = {},
): Promise<{ text: string; model: string; usage: OpenRouterUsage }> {
  const response = await chatCompletion(
    [{ role: 'user', content: prompt }],
    opts,
  )
  return {
    text: response.choices[0]?.message?.content ?? '',
    model: response.model,
    usage: response.usage,
  }
}

/**
 * System + user prompt pattern (common for heartbeats/task analysis).
 */
export async function instruct(
  system: string,
  user: string,
  opts: OpenRouterOptions = {},
): Promise<{ text: string; model: string; usage: OpenRouterUsage }> {
  const response = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    opts,
  )
  return {
    text: response.choices[0]?.message?.content ?? '',
    model: response.model,
    usage: response.usage,
  }
}

// ─── Cost logging bridge ───

/**
 * Converts an OpenRouter response into a cost log entry
 * compatible with our /api/llm-cost/logs/batch endpoint.
 */
export function toCostLogEntry(
  response: OpenRouterResponse,
  meta?: { label?: string; quadrant?: string },
) {
  const u = response.usage

  return {
    model: response.model,
    provider: 'openrouter',
    tokens_input: u.prompt_tokens,
    tokens_output: u.completion_tokens,
    cost_total_usd: u.cost ?? 0,
    cost_input_usd: u.cost_details?.upstream_inference_prompt_cost ?? 0,
    cost_output_usd: u.cost_details?.upstream_inference_completions_cost ?? 0,
    status: 'success' as const,
    latency_total_ms: 0, // overwritten by caller
    tags: {
      generation_id: response.id,
      source: meta?.label ?? 'octavius',
      ...(meta?.quadrant ? { quadrant: meta.quadrant } : {}),
    },
  }
}

/**
 * Make a call AND log the cost in one step.
 * This is the primary entry point for Octavius internal LLM usage.
 */
export async function callAndLog(
  messages: OpenRouterMessage[],
  opts: OpenRouterOptions & { label?: string; quadrant?: string } = {},
): Promise<{ text: string; model: string; usage: OpenRouterUsage; costUsd: number }> {
  const start = Date.now()
  const response = await chatCompletion(messages, opts)
  const durationMs = Date.now() - start

  const entry = toCostLogEntry(response, {
    label: opts.label,
    quadrant: opts.quadrant,
  })
  entry.latency_total_ms = durationMs

  // Fire-and-forget cost log — don't block on it
  logCostEntry(entry).catch((err) =>
    console.error('[openrouter] Failed to log cost:', err),
  )

  return {
    text: response.choices[0]?.message?.content ?? '',
    model: response.model,
    usage: response.usage,
    costUsd: entry.cost_total_usd,
  }
}

async function logCostEntry(entry: ReturnType<typeof toCostLogEntry>) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    await fetch(`${baseUrl}/api/llm-cost/logs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [entry] }),
    })
  } catch {
    // Silently fail — cost logging is best-effort
  }
}
