// src/lib/llm-cost/cost-engine.ts
// Cost calculation engine — computes costs from token counts + model registry pricing

import type { ModelEntry, CostBreakdown, CostEstimate, TokenCounts } from './types'
import type { ModelRegistry } from './model-registry'

/**
 * Calculate actual cost from token counts and model pricing.
 */
export function calculateCost(
  tokens: TokenCounts,
  model: ModelEntry,
): CostBreakdown {
  const pricing = model.pricing
  const version = `${model.source}:${model.last_synced_at.slice(0, 10)}`

  // Base input cost
  const inputTokens = tokens.input
  let inputCost = 0

  // Handle cached tokens (Anthropic-style: 90% discount on reads)
  if (tokens.cached_input && tokens.cached_input > 0 && pricing.cached_input_cost_per_million) {
    const cachedCost =
      (tokens.cached_input * pricing.cached_input_cost_per_million) / 1_000_000
    const nonCachedTokens = Math.max(0, inputTokens - tokens.cached_input)
    const nonCachedCost =
      (nonCachedTokens * pricing.input_cost_per_million) / 1_000_000
    inputCost = cachedCost + nonCachedCost
  } else {
    inputCost = (inputTokens * pricing.input_cost_per_million) / 1_000_000
  }

  // Image token cost (treated as input tokens)
  if (tokens.image_tokens && tokens.image_tokens > 0) {
    if (pricing.image_cost_per_image) {
      // Per-image pricing
      inputCost += pricing.image_cost_per_image * tokens.image_tokens
    } else {
      // Image tokens counted at input rate
      inputCost += (tokens.image_tokens * pricing.input_cost_per_million) / 1_000_000
    }
  }

  // Audio token cost
  if (tokens.audio_tokens && tokens.audio_tokens > 0 && pricing.audio_cost_per_minute) {
    // Rough: ~1500 tokens per minute of audio
    const audioMinutes = tokens.audio_tokens / 1500
    inputCost += audioMinutes * pricing.audio_cost_per_minute
  }

  // Output cost
  const outputCost = (tokens.output * pricing.output_cost_per_million) / 1_000_000

  // Cached savings
  let cachedDiscount = 0
  if (tokens.cached_input && tokens.cached_input > 0 && pricing.cached_input_cost_per_million) {
    const fullCost = (tokens.cached_input * pricing.input_cost_per_million) / 1_000_000
    const discountedCost =
      (tokens.cached_input * pricing.cached_input_cost_per_million) / 1_000_000
    cachedDiscount = fullCost - discountedCost
  }

  const totalCost = round6(inputCost + outputCost)

  return {
    input_cost_usd: round6(inputCost),
    output_cost_usd: round6(outputCost),
    total_cost_usd: totalCost,
    cached_discount_usd: round6(cachedDiscount),
    pricing_version: version,
    is_estimated: false,
  }
}

/**
 * Estimate cost before making an LLM call.
 */
export function estimateCost(
  registry: ModelRegistry,
  modelId: string,
  inputTokens: number,
  estimatedOutputTokens?: number,
  db?: import('better-sqlite3').Database,
): CostEstimate {
  const model = registry.resolve(modelId)
  const warnings: string[] = []
  let confidence: CostEstimate['confidence'] = 'high'

  // If model wasn't in registry, lower confidence
  const directLookup = registry.getModel(modelId)
  if (!directLookup) {
    confidence = 'low'
    warnings.push(`Model "${modelId}" not found in registry, using estimated pricing`)
  }

  // Estimate output tokens
  let outputTokens = estimatedOutputTokens ?? 0
  if (!estimatedOutputTokens) {
    // Try historical average from DB
    if (db) {
      const avg = db
        .prepare(
          'SELECT AVG(tokens_output) as avg_out FROM llm_logs WHERE model = ? AND tokens_output > 0 LIMIT 1000',
        )
        .get(model.model_id) as { avg_out: number | null } | undefined

      if (avg?.avg_out && avg.avg_out > 0) {
        outputTokens = Math.round(avg.avg_out)
        if (confidence === 'high') confidence = 'medium'
      } else {
        // Fallback: assume output = 1.5x input for chat
        outputTokens = Math.round(inputTokens * 1.5)
        confidence = 'low'
        warnings.push('No historical data available, using 1.5x input ratio for output estimate')
      }
    } else {
      outputTokens = Math.round(inputTokens * 1.5)
      confidence = 'low'
      warnings.push('Using default 1.5x ratio for output estimation')
    }
  }

  const tokens: TokenCounts = {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
  }

  const cost = calculateCost(tokens, model)

  if (model.is_deprecated) {
    warnings.push(`Model "${modelId}" is deprecated`)
  }

  return {
    estimated_cost_usd: cost.total_cost_usd,
    input_cost_usd: cost.input_cost_usd,
    output_cost_usd: cost.output_cost_usd,
    model: model.model_id,
    provider: model.provider,
    pricing_version: cost.pricing_version,
    confidence,
    warnings,
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}
