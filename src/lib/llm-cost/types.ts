// src/lib/llm-cost/types.ts
// Type definitions for the LLM Logging & Cost Tracking system

export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'bedrock'
  | 'azure_openai'
  | 'mistral'
  | 'cohere'
  | 'together'
  | 'groq'
  | 'local'
  | 'unknown'

export type RequestType = 'chat' | 'completion' | 'embedding' | 'image_generation' | 'audio'

export type LogStatus = 'success' | 'error' | 'timeout' | 'rate_limited' | 'cancelled' | 'budget_exceeded'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export type BudgetPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly'

export type BudgetEnforcement = 'monitor_only' | 'soft_limit' | 'hard_limit'

// ── Model Registry ──

export interface ModelPricing {
  input_cost_per_million: number
  output_cost_per_million: number
  cached_input_cost_per_million?: number | null
  cache_write_cost_per_million?: number | null
  image_cost_per_image?: number | null
  audio_cost_per_minute?: number | null
  batch_input_cost_per_million?: number | null
  batch_output_cost_per_million?: number | null
  effective_from: string // ISO date
}

export interface ModelEntry {
  model_id: string
  provider: LLMProvider
  display_name: string
  family?: string
  mode: string // chat, embedding, image_generation, etc.
  max_input_tokens?: number
  max_output_tokens?: number
  supports_streaming: boolean
  supports_function_calling: boolean
  supports_vision: boolean
  pricing: ModelPricing
  aliases: string[]
  is_deprecated: boolean
  last_synced_at: string // ISO datetime
  source: 'litellm' | 'manual' | 'provider_api'
}

// ── Log Records ──

export interface TokenCounts {
  input: number
  output: number
  total: number
  cached_input?: number
  reasoning?: number
  image_tokens?: number
  audio_tokens?: number
}

export interface CostBreakdown {
  input_cost_usd: number
  output_cost_usd: number
  total_cost_usd: number
  cached_discount_usd?: number
  pricing_version: string
  is_estimated: boolean
}

export interface LatencyInfo {
  total_ms: number
  time_to_first_token_ms?: number | null
  queue_time_ms?: number
}

export interface LLMLogRecord {
  id: string
  trace_id?: string
  session_id?: string
  request_id?: string

  timestamp: string // ISO datetime
  timestamp_response?: string

  provider: LLMProvider
  provider_raw?: string
  model: string
  model_raw?: string

  request_type: RequestType
  streaming: boolean
  temperature?: number
  max_tokens?: number

  tokens: TokenCounts
  cost: CostBreakdown
  latency: LatencyInfo

  status: LogStatus
  error_code?: string
  error_message?: string

  // Content (optional — privacy)
  prompt_hash?: string
  response_hash?: string
  finish_reason?: string

  // Context
  project_id?: string
  user_id?: string
  agent_id?: string
  environment?: string

  tags: Record<string, string>
}

export interface CreateLogInput {
  trace_id?: string
  session_id?: string
  request_id?: string
  provider?: string
  model: string
  model_raw?: string
  request_type?: RequestType
  streaming?: boolean
  temperature?: number
  max_tokens?: number
  tokens_input?: number
  tokens_output?: number
  tokens_cached_input?: number
  tokens_reasoning?: number
  tokens_image?: number
  tokens_audio?: number
  latency_total_ms?: number
  latency_ttft_ms?: number
  status?: LogStatus
  error_code?: string
  error_message?: string
  prompt_hash?: string
  response_hash?: string
  finish_reason?: string
  project_id?: string
  user_id?: string
  agent_id?: string
  environment?: string
  tags?: Record<string, string>
  // If provided, skip cost calculation
  cost_input_usd?: number
  cost_output_usd?: number
  cost_total_usd?: number
}

// ── Cost Estimation ──

export interface CostEstimate {
  estimated_cost_usd: number
  input_cost_usd: number
  output_cost_usd: number
  model: string
  provider: LLMProvider
  pricing_version: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

// ── Budget ──

export interface Budget {
  id: string
  name: string
  period: BudgetPeriod
  limit_usd: number
  enforcement: BudgetEnforcement
  project_id?: string
  model?: string
  provider?: string
  // Computed
  current_spend_usd?: number
  percent_used?: number
  period_start?: string
  period_end?: string
}

// ── Cost Summary ──

export interface CostSummary {
  total_cost_usd: number
  total_tokens: number
  total_requests: number
  avg_cost_per_request: number
  breakdown: CostBreakdownGroup[]
}

export interface CostBreakdownGroup {
  group: Record<string, string>
  cost_usd: number
  tokens: number
  requests: number
}

export interface CostTimeseries {
  granularity: string
  data: Array<{
    timestamp: string
    cost_usd: number
    tokens: number
    requests: number
  }>
}

// ── Alert Rules ──

export interface AlertRule {
  id: string
  name: string
  enabled: boolean
  type: 'budget_threshold' | 'cost_absolute' | 'error_rate' | 'latency_threshold'
  condition: {
    metric: string
    operator: 'gt' | 'gte' | 'lt' | 'lte'
    threshold: number
    window_minutes?: number
  }
  severity: AlertSeverity
  last_triggered_at?: string
  trigger_count: number
  created_at: string
}

export interface AlertEvent {
  id: string
  rule_id: string
  rule_name: string
  triggered_at: string
  resolved_at?: string
  severity: AlertSeverity
  metric_value: number
  threshold_value: number
}
