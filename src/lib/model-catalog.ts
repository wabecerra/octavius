/**
 * Model Catalog — fetches and caches model pricing from OpenRouter.
 *
 * Runs daily via cron to keep pricing fresh. Results cached in SQLite
 * model_catalog table for fast access by the dashboard and agent config UI.
 */
import { getDatabase } from './memory/db'
import { getProviderKey } from './provider-keys'

interface OpenRouterModel {
  id: string
  name: string
  pricing: { prompt: string; completion: string }
  context_length: number
  architecture?: { modality?: string; tokenizer?: string }
}

/** Fetch all models from OpenRouter and cache in SQLite. */
export async function refreshModelCatalog(): Promise<{ updated: number; errors: number }> {
  const apiKey = getProviderKey('openrouter')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch('https://openrouter.ai/api/v1/models', { headers })
  if (!res.ok) throw new Error(`OpenRouter API returned ${res.status}`)

  const data = await res.json()
  const models = (data.data ?? []) as OpenRouterModel[]

  const db = getDatabase()
  const now = new Date().toISOString()

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO model_catalog
      (model_id, display_name, provider, context_length, price_input_per_m, price_output_per_m, supports_tools, supports_vision, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let updated = 0
  let errors = 0

  const tx = db.transaction(() => {
    for (const m of models) {
      try {
        const provider = m.id.split('/')[0] || 'unknown'
        const inputPrice = parseFloat(m.pricing?.prompt || '0') * 1_000_000
        const outputPrice = parseFloat(m.pricing?.completion || '0') * 1_000_000
        const supportsVision = m.architecture?.modality?.includes('image') ? 1 : 0

        upsert.run(
          m.id,
          m.name || m.id,
          provider,
          m.context_length || 0,
          inputPrice,
          outputPrice,
          1, // assume tool support
          supportsVision,
          now,
        )
        updated++
      } catch {
        errors++
      }
    }
  })

  tx()

  console.log(`[model-catalog] Refreshed ${updated} models (${errors} errors)`)
  return { updated, errors }
}

/** Get cached models from SQLite, optionally filtered. */
export function getCachedModels(opts?: { provider?: string; limit?: number }): Array<{
  modelId: string
  displayName: string
  provider: string
  contextLength: number
  priceInputPerM: number
  priceOutputPerM: number
  supportsVision: boolean
}> {
  const db = getDatabase()
  let sql = 'SELECT * FROM model_catalog'
  const params: unknown[] = []

  if (opts?.provider) {
    sql += ' WHERE provider = ?'
    params.push(opts.provider)
  }

  sql += ' ORDER BY price_input_per_m ASC'

  if (opts?.limit) {
    sql += ' LIMIT ?'
    params.push(opts.limit)
  }

  const rows = db.prepare(sql).all(...params) as Array<{
    model_id: string; display_name: string; provider: string; context_length: number
    price_input_per_m: number; price_output_per_m: number; supports_vision: number
  }>

  return rows.map(r => ({
    modelId: r.model_id,
    displayName: r.display_name,
    provider: r.provider,
    contextLength: r.context_length,
    priceInputPerM: r.price_input_per_m,
    priceOutputPerM: r.price_output_per_m,
    supportsVision: r.supports_vision === 1,
  }))
}
