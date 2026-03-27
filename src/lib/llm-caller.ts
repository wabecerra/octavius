/**
 * Unified LLM caller — routes to OpenRouter → Bedrock → Free fallback.
 *
 * Fallback chain:
 * 1. OpenRouter (default) — uses API key from provider_keys table or env var
 * 2. Amazon Bedrock — uses AWS credentials from provider_keys or env
 * 3. openrouter/free — last resort, rate-limited but zero cost
 *
 * Provider is determined by model prefix or explicit provider option.
 */
import { callAndLog as openRouterCallAndLog, type OpenRouterMessage, type OpenRouterOptions } from './openrouter'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { getProviderKey, getProviderConfig } from './provider-keys'

export interface LLMCallResult {
  text: string
  model: string
  provider: string
  costUsd: number
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  fallbackUsed?: string
  toolCalls?: Array<{ function: { name: string; arguments: string } }>
}

// Bedrock client singleton (recreated if credentials change)
let bedrockClient: BedrockRuntimeClient | null = null
let bedrockRegion: string | null = null

function getBedrockClient(): BedrockRuntimeClient {
  const config = getProviderConfig('bedrock')
  const region = config.region || process.env.AWS_BEDROCK_REGION || 'us-east-1'

  if (!bedrockClient || bedrockRegion !== region) {
    const clientOpts: Record<string, unknown> = { region }
    if (config.accessKeyId && config.secretAccessKey) {
      clientOpts.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }
    }
    bedrockClient = new BedrockRuntimeClient(clientOpts)
    bedrockRegion = region
  }
  return bedrockClient
}

// ─── Model mapping for fallback (OpenRouter model → Bedrock equivalent) ───

const OPENROUTER_TO_BEDROCK: Record<string, string> = {
  'anthropic/claude-opus-4.6': 'global.anthropic.claude-opus-4-6-v1',
  'anthropic/claude-sonnet-4.6': 'us.anthropic.claude-sonnet-4-6-v1:0',
  'anthropic/claude-sonnet-4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'anthropic/claude-haiku-4.5': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
}

/**
 * Call an LLM — routes through the fallback chain.
 */
export async function callLLM(
  messages: OpenRouterMessage[],
  opts: {
    model: string
    provider?: string
    maxTokens?: number
    temperature?: number
    label?: string
    quadrant?: string
    tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  },
): Promise<LLMCallResult> {
  const isBedrock = opts.provider === 'bedrock' || opts.model.startsWith('amazon-bedrock/')

  // If explicitly Bedrock, go direct (no fallback needed)
  if (isBedrock) {
    return callBedrock(messages, opts)
  }

  // Default path: OpenRouter → Bedrock → Free
  try {
    return await callOpenRouter(messages, { ...opts, tools: opts.tools })
  } catch (err) {
    const error = err as Error & { status?: number }
    const status = error.status || (error.message.match(/(\d{3}):/)?.[1] ? parseInt(error.message.match(/(\d{3}):/)?.[1] || '0') : 0)
    const isRetryable = status === 401 || status === 429 || status >= 500

    if (!isRetryable) throw err

    console.warn(`[llm-caller] OpenRouter failed (${status}), trying Bedrock fallback...`)

    // Fallback 1: Try Bedrock with equivalent model
    const bedrockModel = OPENROUTER_TO_BEDROCK[opts.model]
    if (bedrockModel) {
      try {
        const result = await callBedrock(messages, {
          ...opts,
          model: `amazon-bedrock/${bedrockModel}`,
          provider: 'bedrock',
        })
        return { ...result, fallbackUsed: 'bedrock' }
      } catch (bedrockErr) {
        console.warn(`[llm-caller] Bedrock fallback also failed:`, (bedrockErr as Error).message)
      }
    }

    // Fallback 2: OpenRouter free tier (always available)
    console.warn(`[llm-caller] Trying openrouter/free as last resort...`)
    try {
      const result = await callOpenRouter(messages, { ...opts, model: 'openrouter/free', tools: opts.tools })
      return { ...result, fallbackUsed: 'openrouter/free' }
    } catch (freeErr) {
      console.error(`[llm-caller] All providers failed. Last error:`, (freeErr as Error).message)
      throw err // Throw the original error
    }
  }
}

async function callOpenRouter(
  messages: OpenRouterMessage[],
  opts: {
    model: string
    maxTokens?: number
    temperature?: number
    label?: string
    quadrant?: string
    tools?: unknown[]
  },
): Promise<LLMCallResult> {
  // Inject API key from provider_keys if available
  const apiKey = getProviderKey('openrouter')
  if (apiKey) {
    process.env.OPENROUTER_API_KEY = apiKey
  }

  const result = await openRouterCallAndLog(messages, {
    model: opts.model,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    label: opts.label,
    quadrant: opts.quadrant,
    tools: opts.tools as OpenRouterOptions['tools'],
  })
  return {
    text: result.text,
    model: result.model,
    provider: 'openrouter',
    costUsd: result.costUsd,
    usage: {
      prompt_tokens: result.usage.prompt_tokens,
      completion_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.total_tokens,
    },
    toolCalls: result.toolCalls,
  }
}

async function callBedrock(
  messages: OpenRouterMessage[],
  opts: { model: string; provider?: string; maxTokens?: number; temperature?: number; label?: string; quadrant?: string },
): Promise<LLMCallResult> {
  const client = getBedrockClient()
  const modelId = opts.model.replace('amazon-bedrock/', '')

  const systemMessages = messages.filter((m) => m.role === 'system')
  const conversationMessages = messages.filter((m) => m.role !== 'system')

  const system = systemMessages.length > 0
    ? systemMessages.map((m) => ({ text: m.content }))
    : undefined

  const bedrockMessages = conversationMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: [{ text: m.content }],
  }))

  const start = Date.now()

  const command = new ConverseCommand({
    modelId,
    messages: bedrockMessages,
    system,
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
    },
  })

  const response = await client.send(command)
  const durationMs = Date.now() - start

  const outputText = response.output?.message?.content?.[0]?.text ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usageAny = response.usage as any
  const inputTokens: number = usageAny?.inputTokens ?? 0
  const outputTokens: number = usageAny?.outputTokens ?? 0

  // Estimate cost (Opus 4.6: ~$15/M input, ~$75/M output)
  const costUsd = (inputTokens * 15 + outputTokens * 75) / 1_000_000

  // Log to LLM cost tracker (best-effort)
  logBedrockCost({
    model: modelId,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs,
    label: opts.label,
    quadrant: opts.quadrant,
  })

  return {
    text: outputText,
    model: modelId,
    provider: 'bedrock',
    costUsd,
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  }
}

function logBedrockCost(entry: {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  label?: string
  quadrant?: string
}) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    fetch(`${baseUrl}/api/llm-cost/logs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{
          model: entry.model,
          provider: 'bedrock',
          tokens_input: entry.inputTokens,
          tokens_output: entry.outputTokens,
          cost_total_usd: entry.costUsd,
          cost_input_usd: (entry.inputTokens * 15) / 1_000_000,
          cost_output_usd: (entry.outputTokens * 75) / 1_000_000,
          status: 'success',
          latency_total_ms: entry.durationMs,
          tags: {
            source: entry.label ?? 'octavius',
            ...(entry.quadrant ? { quadrant: entry.quadrant } : {}),
          },
        }],
      }),
    }).catch(() => {})
  } catch {
    // best-effort
  }
}
