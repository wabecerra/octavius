// src/lib/llm-cost/model-registry.ts
// Model registry with LiteLLM sync for pricing data

import type Database from 'better-sqlite3'
import type { ModelEntry, LLMProvider } from './types'

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

// Provider detection patterns
const PROVIDER_PATTERNS: Array<{ pattern: RegExp; provider: LLMProvider }> = [
  { pattern: /^gpt-|^o[13]-|^text-embedding|^dall-e|^tts-|^whisper/i, provider: 'openai' },
  { pattern: /^claude-/i, provider: 'anthropic' },
  { pattern: /^gemini-|^palm/i, provider: 'google' },
  { pattern: /^mistral-|^codestral|^pixtral/i, provider: 'mistral' },
  { pattern: /^command-|^embed-/i, provider: 'cohere' },
  { pattern: /^llama-|^meta-llama/i, provider: 'together' },
  { pattern: /^mixtral/i, provider: 'groq' },
]

// LiteLLM provider mapping
const LITELLM_PROVIDER_MAP: Record<string, LLMProvider> = {
  openai: 'openai',
  azure: 'azure_openai',
  azure_ai: 'azure_openai',
  anthropic: 'anthropic',
  vertex_ai: 'google',
  'vertex_ai-text-models': 'google',
  'vertex_ai-chat-models': 'google',
  'vertex_ai-language-models': 'google',
  'vertex_ai-vision-models': 'google',
  gemini: 'google',
  palm: 'google',
  bedrock: 'bedrock',
  cohere: 'cohere',
  cohere_chat: 'cohere',
  mistral: 'mistral',
  together_ai: 'together',
  groq: 'groq',
  ollama: 'local',
  'ollama_chat': 'local',
  openrouter: 'openrouter',
}

export class ModelRegistry {
  constructor(private db: Database.Database) {}

  /** Get a model by ID, checking aliases if not found directly. */
  getModel(modelId: string): ModelEntry | null {
    // Direct lookup
    const row = this.db
      .prepare('SELECT * FROM llm_models WHERE model_id = ?')
      .get(modelId) as ModelRow | undefined

    if (row) return rowToEntry(row)

    // Alias lookup
    const aliasRow = this.db
      .prepare("SELECT * FROM llm_models WHERE aliases LIKE ?")
      .get(`%"${modelId}"%`) as ModelRow | undefined

    if (aliasRow) return rowToEntry(aliasRow)

    return null
  }

  /** Resolve a model ID — returns the model or creates an estimated entry. */
  resolve(modelId: string): ModelEntry {
    const existing = this.getModel(modelId)
    if (existing) return existing

    // Auto-detect provider
    const provider = detectProvider(modelId)

    // Create a placeholder with estimated pricing
    return {
      model_id: modelId,
      provider,
      display_name: modelId,
      mode: 'chat',
      supports_streaming: true,
      supports_function_calling: false,
      supports_vision: false,
      pricing: {
        input_cost_per_million: 1.0,
        output_cost_per_million: 2.0,
        effective_from: new Date().toISOString().slice(0, 10),
      },
      aliases: [],
      is_deprecated: false,
      last_synced_at: new Date().toISOString(),
      source: 'manual',
    }
  }

  /** List all models, optionally filtered. */
  listModels(filters?: {
    provider?: string
    mode?: string
    include_deprecated?: boolean
  }): ModelEntry[] {
    let sql = 'SELECT * FROM llm_models WHERE 1=1'
    const params: unknown[] = []

    if (filters?.provider) {
      sql += ' AND provider = ?'
      params.push(filters.provider)
    }
    if (filters?.mode) {
      sql += ' AND mode = ?'
      params.push(filters.mode)
    }
    if (!filters?.include_deprecated) {
      sql += ' AND is_deprecated = 0'
    }

    sql += ' ORDER BY provider, model_id'
    const rows = this.db.prepare(sql).all(...params) as ModelRow[]
    return rows.map(rowToEntry)
  }

  /** Update or insert a model manually. */
  upsertModel(entry: ModelEntry): void {
    this.db
      .prepare(
        `INSERT INTO llm_models (
          model_id, provider, display_name, family, mode,
          max_input_tokens, max_output_tokens,
          supports_streaming, supports_function_calling, supports_vision,
          input_cost_per_million, output_cost_per_million,
          cached_input_cost_per_million, cache_write_cost_per_million,
          image_cost_per_image, audio_cost_per_minute,
          batch_input_cost_per_million, batch_output_cost_per_million,
          pricing_effective_from, aliases, is_deprecated,
          last_synced_at, source
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(model_id) DO UPDATE SET
          provider=excluded.provider,
          display_name=excluded.display_name,
          family=excluded.family,
          mode=excluded.mode,
          max_input_tokens=excluded.max_input_tokens,
          max_output_tokens=excluded.max_output_tokens,
          supports_streaming=excluded.supports_streaming,
          supports_function_calling=excluded.supports_function_calling,
          supports_vision=excluded.supports_vision,
          input_cost_per_million=excluded.input_cost_per_million,
          output_cost_per_million=excluded.output_cost_per_million,
          cached_input_cost_per_million=excluded.cached_input_cost_per_million,
          cache_write_cost_per_million=excluded.cache_write_cost_per_million,
          image_cost_per_image=excluded.image_cost_per_image,
          audio_cost_per_minute=excluded.audio_cost_per_minute,
          batch_input_cost_per_million=excluded.batch_input_cost_per_million,
          batch_output_cost_per_million=excluded.batch_output_cost_per_million,
          pricing_effective_from=excluded.pricing_effective_from,
          aliases=excluded.aliases,
          is_deprecated=excluded.is_deprecated,
          last_synced_at=excluded.last_synced_at,
          source=excluded.source`,
      )
      .run(
        entry.model_id,
        entry.provider,
        entry.display_name,
        entry.family ?? null,
        entry.mode,
        entry.max_input_tokens ?? null,
        entry.max_output_tokens ?? null,
        entry.supports_streaming ? 1 : 0,
        entry.supports_function_calling ? 1 : 0,
        entry.supports_vision ? 1 : 0,
        entry.pricing.input_cost_per_million,
        entry.pricing.output_cost_per_million,
        entry.pricing.cached_input_cost_per_million ?? null,
        entry.pricing.cache_write_cost_per_million ?? null,
        entry.pricing.image_cost_per_image ?? null,
        entry.pricing.audio_cost_per_minute ?? null,
        entry.pricing.batch_input_cost_per_million ?? null,
        entry.pricing.batch_output_cost_per_million ?? null,
        entry.pricing.effective_from,
        JSON.stringify(entry.aliases),
        entry.is_deprecated ? 1 : 0,
        entry.last_synced_at,
        entry.source,
      )
  }

  /** Get model count by provider. */
  getStats(): Record<string, number> {
    const rows = this.db
      .prepare('SELECT provider, COUNT(*) as count FROM llm_models GROUP BY provider')
      .all() as Array<{ provider: string; count: number }>

    const stats: Record<string, number> = {}
    for (const r of rows) stats[r.provider] = r.count
    return stats
  }

  /**
   * Sync models from LiteLLM's community-maintained JSON.
   * Returns the number of models synced.
   */
  async syncFromLiteLLM(): Promise<{ synced: number; errors: number }> {
    let synced = 0
    let errors = 0

    try {
      const res = await fetch(LITELLM_URL, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Record<string, LiteLLMModel>

      const now = new Date().toISOString()
      const insertMany = this.db.transaction((entries: ModelEntry[]) => {
        for (const entry of entries) {
          try {
            this.upsertModel(entry)
            synced++
          } catch {
            errors++
          }
        }
      })

      const entries: ModelEntry[] = []

      for (const [key, model] of Object.entries(data)) {
        // Skip entries without pricing
        if (
          model.input_cost_per_token == null ||
          model.output_cost_per_token == null
        ) {
          continue
        }

        // Determine provider
        const litellmProvider = model.litellm_provider ?? ''
        const provider: LLMProvider =
          LITELLM_PROVIDER_MAP[litellmProvider] ?? detectProvider(key)

        // Strip provider prefix from model ID for cleaner names
        const modelId = key.includes('/') ? key.split('/').pop()! : key

        entries.push({
          model_id: modelId,
          provider,
          display_name: modelId,
          family: extractFamily(modelId),
          mode: model.mode ?? 'chat',
          max_input_tokens: model.max_input_tokens ?? model.max_tokens ?? undefined,
          max_output_tokens: model.max_output_tokens ?? model.max_tokens ?? undefined,
          supports_streaming: true,
          supports_function_calling: model.supports_function_calling ?? false,
          supports_vision: model.supports_vision ?? false,
          pricing: {
            input_cost_per_million: model.input_cost_per_token * 1_000_000,
            output_cost_per_million: model.output_cost_per_token * 1_000_000,
            cached_input_cost_per_million:
              model.cache_read_input_token_cost != null
                ? model.cache_read_input_token_cost * 1_000_000
                : null,
            cache_write_cost_per_million:
              model.cache_creation_input_token_cost != null
                ? model.cache_creation_input_token_cost * 1_000_000
                : null,
            effective_from: now.slice(0, 10),
          },
          aliases: key.includes('/') ? [key] : [],
          is_deprecated: false,
          last_synced_at: now,
          source: 'litellm',
        })
      }

      insertMany(entries)
    } catch (err) {
      console.error('[ModelRegistry] LiteLLM sync failed:', err)
      errors++
    }

    return { synced, errors }
  }
}

// ── Provider detection ──

export function detectProvider(modelId: string): LLMProvider {
  const lower = modelId.toLowerCase()

  // Check for provider prefix
  if (lower.includes('/')) {
    const prefix = lower.split('/')[0]
    if (LITELLM_PROVIDER_MAP[prefix]) return LITELLM_PROVIDER_MAP[prefix]
  }

  for (const { pattern, provider } of PROVIDER_PATTERNS) {
    if (pattern.test(lower)) return provider
  }

  return 'unknown'
}

function extractFamily(modelId: string): string {
  const lower = modelId.toLowerCase()
  if (lower.startsWith('gpt-4o')) return 'gpt-4o'
  if (lower.startsWith('gpt-4')) return 'gpt-4'
  if (lower.startsWith('gpt-3.5')) return 'gpt-3.5'
  if (lower.startsWith('o1')) return 'o1'
  if (lower.startsWith('o3')) return 'o3'
  if (lower.includes('claude-3-opus') || lower.includes('claude-opus')) return 'claude-opus'
  if (lower.includes('claude-3-sonnet') || lower.includes('claude-sonnet')) return 'claude-sonnet'
  if (lower.includes('claude-3-haiku') || lower.includes('claude-haiku')) return 'claude-haiku'
  if (lower.startsWith('gemini-2.5')) return 'gemini-2.5'
  if (lower.startsWith('gemini-2.0')) return 'gemini-2.0'
  if (lower.startsWith('gemini-1.5')) return 'gemini-1.5'
  return modelId.split('-').slice(0, 2).join('-')
}

// ── DB row mapping ──

interface ModelRow {
  model_id: string
  provider: string
  display_name: string
  family: string | null
  mode: string
  max_input_tokens: number | null
  max_output_tokens: number | null
  supports_streaming: number
  supports_function_calling: number
  supports_vision: number
  input_cost_per_million: number
  output_cost_per_million: number
  cached_input_cost_per_million: number | null
  cache_write_cost_per_million: number | null
  image_cost_per_image: number | null
  audio_cost_per_minute: number | null
  batch_input_cost_per_million: number | null
  batch_output_cost_per_million: number | null
  pricing_effective_from: string | null
  aliases: string
  is_deprecated: number
  last_synced_at: string
  source: string
}

function rowToEntry(row: ModelRow): ModelEntry {
  return {
    model_id: row.model_id,
    provider: row.provider as LLMProvider,
    display_name: row.display_name,
    family: row.family ?? undefined,
    mode: row.mode,
    max_input_tokens: row.max_input_tokens ?? undefined,
    max_output_tokens: row.max_output_tokens ?? undefined,
    supports_streaming: !!row.supports_streaming,
    supports_function_calling: !!row.supports_function_calling,
    supports_vision: !!row.supports_vision,
    pricing: {
      input_cost_per_million: row.input_cost_per_million,
      output_cost_per_million: row.output_cost_per_million,
      cached_input_cost_per_million: row.cached_input_cost_per_million,
      cache_write_cost_per_million: row.cache_write_cost_per_million,
      image_cost_per_image: row.image_cost_per_image,
      audio_cost_per_minute: row.audio_cost_per_minute,
      batch_input_cost_per_million: row.batch_input_cost_per_million,
      batch_output_cost_per_million: row.batch_output_cost_per_million,
      effective_from: row.pricing_effective_from ?? '',
    },
    aliases: JSON.parse(row.aliases),
    is_deprecated: !!row.is_deprecated,
    last_synced_at: row.last_synced_at,
    source: row.source as ModelEntry['source'],
  }
}

// ── LiteLLM JSON type (partial) ──

interface LiteLLMModel {
  litellm_provider?: string
  input_cost_per_token?: number
  output_cost_per_token?: number
  max_tokens?: number
  max_input_tokens?: number
  max_output_tokens?: number
  mode?: string
  supports_function_calling?: boolean
  supports_vision?: boolean
  cache_read_input_token_cost?: number
  cache_creation_input_token_cost?: number
}
