/**
 * Unified LLM caller — routes to OpenRouter or Bedrock based on provider config.
 *
 * For OpenRouter: uses the existing callAndLog function.
 * For Bedrock: uses AWS SDK Bedrock Converse API directly.
 */
import { callAndLog as openRouterCallAndLog, type OpenRouterMessage } from './openrouter'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

export interface LLMCallResult {
  text: string
  model: string
  costUsd: number
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

// Bedrock client singleton
let bedrockClient: BedrockRuntimeClient | null = null

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' })
  }
  return bedrockClient
}

/**
 * Call an LLM — automatically routes to OpenRouter or Bedrock based on model prefix.
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
  },
): Promise<LLMCallResult> {
  const isBedrock = opts.provider === 'bedrock' || opts.model.startsWith('amazon-bedrock/')

  if (isBedrock) {
    return callBedrock(messages, opts)
  } else {
    return callOpenRouter(messages, opts)
  }
}

async function callOpenRouter(
  messages: OpenRouterMessage[],
  opts: { model: string; maxTokens?: number; temperature?: number; label?: string; quadrant?: string },
): Promise<LLMCallResult> {
  const result = await openRouterCallAndLog(messages, {
    model: opts.model,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    label: opts.label,
    quadrant: opts.quadrant,
  })
  return {
    text: result.text,
    model: result.model,
    costUsd: result.costUsd,
    usage: {
      prompt_tokens: result.usage.prompt_tokens,
      completion_tokens: result.usage.completion_tokens,
      total_tokens: result.usage.total_tokens,
    },
  }
}

async function callBedrock(
  messages: OpenRouterMessage[],
  opts: { model: string; maxTokens?: number; temperature?: number; label?: string; quadrant?: string },
): Promise<LLMCallResult> {
  const client = getBedrockClient()

  // Strip 'amazon-bedrock/' prefix for the actual Bedrock model ID
  const modelId = opts.model.replace('amazon-bedrock/', '')

  // Separate system message from conversation
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
