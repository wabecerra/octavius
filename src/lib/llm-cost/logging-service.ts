// src/lib/llm-cost/logging-service.ts
// Core service for ingesting, querying, and aggregating LLM logs

import type Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { LLM_COST_SCHEMA } from './schema'
import { ModelRegistry, detectProvider } from './model-registry'
import { calculateCost } from './cost-engine'
import type {
  LLMLogRecord,
  CreateLogInput,
  CostSummary,
  CostTimeseries,
  Budget,
  BudgetPeriod,
  LLMProvider,
} from './types'

export class LLMLoggingService {
  private registry: ModelRegistry

  constructor(private db: Database.Database) {
    // Ensure schema exists
    db.exec(LLM_COST_SCHEMA)
    this.registry = new ModelRegistry(db)
  }

  getRegistry(): ModelRegistry {
    return this.registry
  }

  // ═══════════════════════════════════════════════════════
  // LOG INGESTION
  // ═══════════════════════════════════════════════════════

  /** Ingest a single LLM log record with automatic enrichment. */
  ingest(input: CreateLogInput): LLMLogRecord {
    const id = nanoid()
    const now = new Date().toISOString()

    // Resolve model & provider
    const model = this.registry.resolve(input.model)
    const provider: LLMProvider =
      (input.provider as LLMProvider) ?? model.provider ?? detectProvider(input.model)

    // Token counts
    const tokensInput = input.tokens_input ?? 0
    const tokensOutput = input.tokens_output ?? 0
    const tokensTotal = tokensInput + tokensOutput
    const tokensCached = input.tokens_cached_input ?? 0
    const tokensReasoning = input.tokens_reasoning ?? 0
    const tokensImage = input.tokens_image ?? 0
    const tokensAudio = input.tokens_audio ?? 0

    // Cost calculation
    let costInputUsd = input.cost_input_usd ?? 0
    let costOutputUsd = input.cost_output_usd ?? 0
    let costTotalUsd = input.cost_total_usd ?? 0
    let costCachedDiscount = 0
    let pricingVersion = 'provided'
    let costIsEstimated = false

    if (input.cost_total_usd == null) {
      // Calculate cost from tokens + registry pricing
      const cost = calculateCost(
        {
          input: tokensInput,
          output: tokensOutput,
          total: tokensTotal,
          cached_input: tokensCached,
          reasoning: tokensReasoning,
          image_tokens: tokensImage,
          audio_tokens: tokensAudio,
        },
        model,
      )
      costInputUsd = cost.input_cost_usd
      costOutputUsd = cost.output_cost_usd
      costTotalUsd = cost.total_cost_usd
      costCachedDiscount = cost.cached_discount_usd ?? 0
      pricingVersion = cost.pricing_version
      costIsEstimated = cost.is_estimated
    }

    const record: LLMLogRecord = {
      id,
      trace_id: input.trace_id,
      session_id: input.session_id,
      request_id: input.request_id,
      timestamp: now,
      timestamp_response: input.latency_total_ms
        ? new Date(Date.now()).toISOString()
        : undefined,
      provider,
      provider_raw: input.provider,
      model: model.model_id,
      model_raw: input.model_raw ?? input.model,
      request_type: input.request_type ?? 'chat',
      streaming: input.streaming ?? false,
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      tokens: {
        input: tokensInput,
        output: tokensOutput,
        total: tokensTotal,
        cached_input: tokensCached,
        reasoning: tokensReasoning,
        image_tokens: tokensImage,
        audio_tokens: tokensAudio,
      },
      cost: {
        input_cost_usd: costInputUsd,
        output_cost_usd: costOutputUsd,
        total_cost_usd: costTotalUsd,
        cached_discount_usd: costCachedDiscount,
        pricing_version: pricingVersion,
        is_estimated: costIsEstimated,
      },
      latency: {
        total_ms: input.latency_total_ms ?? 0,
        time_to_first_token_ms: input.latency_ttft_ms,
      },
      status: input.status ?? 'success',
      error_code: input.error_code,
      error_message: input.error_message,
      prompt_hash: input.prompt_hash,
      response_hash: input.response_hash,
      finish_reason: input.finish_reason,
      project_id: input.project_id,
      user_id: input.user_id,
      agent_id: input.agent_id,
      environment: input.environment,
      tags: input.tags ?? {},
    }

    // Insert into DB
    this.db
      .prepare(
        `INSERT INTO llm_logs (
          id, trace_id, session_id, request_id,
          timestamp, timestamp_response,
          provider, provider_raw, model, model_raw,
          request_type, streaming, temperature, max_tokens,
          tokens_input, tokens_output, tokens_total,
          tokens_cached_input, tokens_reasoning, tokens_image, tokens_audio,
          cost_input_usd, cost_output_usd, cost_total_usd, cost_cached_discount_usd,
          pricing_version, cost_is_estimated,
          latency_total_ms, latency_ttft_ms,
          status, error_code, error_message,
          prompt_hash, response_hash, finish_reason,
          project_id, user_id, agent_id, environment,
          tags
        ) VALUES (
          ?,?,?,?, ?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?, ?,?, ?,?, ?,?,?, ?,?,?, ?,?,?,?, ?
        )`,
      )
      .run(
        id, input.trace_id ?? null, input.session_id ?? null, input.request_id ?? null,
        now, record.timestamp_response ?? null,
        provider, input.provider ?? null, model.model_id, input.model_raw ?? input.model,
        record.request_type, record.streaming ? 1 : 0, input.temperature ?? null, input.max_tokens ?? null,
        tokensInput, tokensOutput, tokensTotal,
        tokensCached, tokensReasoning, tokensImage, tokensAudio,
        costInputUsd, costOutputUsd, costTotalUsd, costCachedDiscount,
        pricingVersion, costIsEstimated ? 1 : 0,
        input.latency_total_ms ?? 0, input.latency_ttft_ms ?? null,
        record.status, input.error_code ?? null, input.error_message ?? null,
        input.prompt_hash ?? null, input.response_hash ?? null, input.finish_reason ?? null,
        input.project_id ?? null, input.user_id ?? null, input.agent_id ?? null, input.environment ?? null,
        JSON.stringify(record.tags),
      )

    return record
  }

  /** Batch ingest multiple logs. */
  ingestBatch(inputs: CreateLogInput[]): { accepted: number; failed: number } {
    let accepted = 0
    let failed = 0

    const txn = this.db.transaction(() => {
      for (const input of inputs) {
        try {
          this.ingest(input)
          accepted++
        } catch {
          failed++
        }
      }
    })

    txn()
    return { accepted, failed }
  }

  // ═══════════════════════════════════════════════════════
  // QUERYING
  // ═══════════════════════════════════════════════════════

  /** Get a single log by ID. */
  getLog(id: string): LLMLogRecord | null {
    const row = this.db.prepare('SELECT * FROM llm_logs WHERE id = ?').get(id) as LogRow | undefined
    return row ? logRowToRecord(row) : null
  }

  /** Query logs with filters. */
  queryLogs(filters: {
    start_time?: string
    end_time?: string
    model?: string
    provider?: string
    status?: string
    project_id?: string
    agent_id?: string
    trace_id?: string
    min_cost_usd?: number
    limit?: number
    offset?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }): { data: LLMLogRecord[]; total: number } {
    let where = 'WHERE 1=1'
    const params: unknown[] = []

    if (filters.start_time) { where += ' AND timestamp >= ?'; params.push(filters.start_time) }
    if (filters.end_time) { where += ' AND timestamp <= ?'; params.push(filters.end_time) }
    if (filters.model) { where += ' AND model = ?'; params.push(filters.model) }
    if (filters.provider) { where += ' AND provider = ?'; params.push(filters.provider) }
    if (filters.status) { where += ' AND status = ?'; params.push(filters.status) }
    if (filters.project_id) { where += ' AND project_id = ?'; params.push(filters.project_id) }
    if (filters.agent_id) { where += ' AND agent_id = ?'; params.push(filters.agent_id) }
    if (filters.trace_id) { where += ' AND trace_id = ?'; params.push(filters.trace_id) }
    if (filters.min_cost_usd != null) { where += ' AND cost_total_usd >= ?'; params.push(filters.min_cost_usd) }

    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as c FROM llm_logs ${where}`)
      .get(...params) as { c: number }

    const sortCol = filters.sort_by === 'cost' ? 'cost_total_usd'
      : filters.sort_by === 'latency' ? 'latency_total_ms'
      : filters.sort_by === 'tokens' ? 'tokens_total'
      : 'timestamp'
    const sortDir = filters.sort_order === 'asc' ? 'ASC' : 'DESC'
    const limit = Math.min(filters.limit ?? 100, 1000)
    const offset = filters.offset ?? 0

    const rows = this.db
      .prepare(
        `SELECT * FROM llm_logs ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as LogRow[]

    return {
      data: rows.map(logRowToRecord),
      total: totalRow.c,
    }
  }

  // ═══════════════════════════════════════════════════════
  // COST SUMMARY & TIMESERIES
  // ═══════════════════════════════════════════════════════

  /** Get aggregated cost summary. */
  getCostSummary(filters: {
    start_time: string
    end_time: string
    group_by?: string[] // model, provider, project_id, agent_id
    project_id?: string
    model?: string
  }): CostSummary {
    let where = 'WHERE timestamp >= ? AND timestamp <= ?'
    const params: unknown[] = [filters.start_time, filters.end_time]

    if (filters.project_id) { where += ' AND project_id = ?'; params.push(filters.project_id) }
    if (filters.model) { where += ' AND model = ?'; params.push(filters.model) }

    // Totals
    const totals = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(cost_total_usd), 0) as total_cost,
          COALESCE(SUM(tokens_total), 0) as total_tokens,
          COUNT(*) as total_requests,
          COALESCE(AVG(cost_total_usd), 0) as avg_cost
        FROM llm_logs ${where}`,
      )
      .get(...params) as { total_cost: number; total_tokens: number; total_requests: number; avg_cost: number }

    // Breakdown by group
    const groupCols = (filters.group_by ?? ['model']).filter((g) =>
      ['model', 'provider', 'project_id', 'agent_id'].includes(g),
    )

    const groupSelect = groupCols.length > 0 ? groupCols.join(', ') : 'model'
    const groupBy = groupCols.length > 0 ? groupCols.join(', ') : 'model'

    const breakdownRows = this.db
      .prepare(
        `SELECT ${groupSelect},
          SUM(cost_total_usd) as cost,
          SUM(tokens_total) as tokens,
          COUNT(*) as requests
        FROM llm_logs ${where}
        GROUP BY ${groupBy}
        ORDER BY cost DESC
        LIMIT 50`,
      )
      .all(...params) as Array<Record<string, unknown>>

    const breakdown = breakdownRows.map((row) => {
      const group: Record<string, string> = {}
      for (const col of groupCols.length > 0 ? groupCols : ['model']) {
        group[col] = String(row[col] ?? '')
      }
      return {
        group,
        cost_usd: (row.cost as number) ?? 0,
        tokens: (row.tokens as number) ?? 0,
        requests: (row.requests as number) ?? 0,
      }
    })

    return {
      total_cost_usd: totals.total_cost,
      total_tokens: totals.total_tokens,
      total_requests: totals.total_requests,
      avg_cost_per_request: totals.avg_cost,
      breakdown,
    }
  }

  /** Get cost timeseries data. */
  getCostTimeseries(filters: {
    start_time: string
    end_time: string
    granularity?: 'hour' | 'day' | 'week' | 'month'
    project_id?: string
  }): CostTimeseries {
    const gran = filters.granularity ?? 'hour'
    let truncExpr: string

    switch (gran) {
      case 'hour':
        truncExpr = "strftime('%Y-%m-%dT%H:00:00Z', timestamp)"
        break
      case 'day':
        truncExpr = "strftime('%Y-%m-%d', timestamp)"
        break
      case 'week':
        truncExpr = "strftime('%Y-W%W', timestamp)"
        break
      case 'month':
        truncExpr = "strftime('%Y-%m', timestamp)"
        break
    }

    let where = 'WHERE timestamp >= ? AND timestamp <= ?'
    const params: unknown[] = [filters.start_time, filters.end_time]
    if (filters.project_id) { where += ' AND project_id = ?'; params.push(filters.project_id) }

    const rows = this.db
      .prepare(
        `SELECT
          ${truncExpr} as bucket,
          COALESCE(SUM(cost_total_usd), 0) as cost,
          COALESCE(SUM(tokens_total), 0) as tokens,
          COUNT(*) as requests
        FROM llm_logs ${where}
        GROUP BY bucket
        ORDER BY bucket ASC`,
      )
      .all(...params) as Array<{ bucket: string; cost: number; tokens: number; requests: number }>

    return {
      granularity: gran,
      data: rows.map((r) => ({
        timestamp: r.bucket,
        cost_usd: r.cost,
        tokens: r.tokens,
        requests: r.requests,
      })),
    }
  }

  // ═══════════════════════════════════════════════════════
  // BUDGETS
  // ═══════════════════════════════════════════════════════

  /** Create a budget. */
  createBudget(input: Omit<Budget, 'current_spend_usd' | 'percent_used' | 'period_start' | 'period_end'>): Budget {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO llm_budgets (id, name, period, limit_usd, enforcement, project_id, model, provider, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(input.id, input.name, input.period, input.limit_usd, input.enforcement,
        input.project_id ?? null, input.model ?? null, input.provider ?? null, now, now)

    return this.getBudget(input.id)!
  }

  /** Get budget with current usage. */
  getBudget(id: string): Budget | null {
    const row = this.db
      .prepare('SELECT * FROM llm_budgets WHERE id = ?')
      .get(id) as BudgetRow | undefined

    if (!row) return null
    return this.enrichBudget(row)
  }

  /** List all budgets. */
  listBudgets(): Budget[] {
    const rows = this.db
      .prepare('SELECT * FROM llm_budgets ORDER BY name')
      .all() as BudgetRow[]
    return rows.map((r) => this.enrichBudget(r))
  }

  /** Check if a request would exceed a budget. */
  checkBudget(budgetId: string, estimatedCostUsd: number): {
    allowed: boolean
    current_usage_usd: number
    remaining_usd: number
    would_exceed: boolean
    enforcement: string
  } {
    const budget = this.getBudget(budgetId)
    if (!budget) throw new Error('Budget not found')

    const currentSpend = budget.current_spend_usd ?? 0
    const remaining = budget.limit_usd - currentSpend
    const wouldExceed = estimatedCostUsd > remaining

    const allowed =
      budget.enforcement === 'monitor_only' ||
      budget.enforcement === 'soft_limit' ||
      !wouldExceed

    return {
      allowed,
      current_usage_usd: currentSpend,
      remaining_usd: Math.max(0, remaining),
      would_exceed: wouldExceed,
      enforcement: budget.enforcement,
    }
  }

  /** Delete a budget. */
  deleteBudget(id: string): boolean {
    const result = this.db.prepare('DELETE FROM llm_budgets WHERE id = ?').run(id)
    return result.changes > 0
  }

  private enrichBudget(row: BudgetRow): Budget {
    const { start, end } = getPeriodBounds(row.period as BudgetPeriod)

    let where = 'timestamp >= ? AND timestamp <= ?'
    const params: unknown[] = [start, end]

    if (row.project_id) { where += ' AND project_id = ?'; params.push(row.project_id) }
    if (row.model) { where += ' AND model = ?'; params.push(row.model) }
    if (row.provider) { where += ' AND provider = ?'; params.push(row.provider) }

    const usage = this.db
      .prepare(`SELECT COALESCE(SUM(cost_total_usd), 0) as spent FROM llm_logs WHERE ${where}`)
      .get(...params) as { spent: number }

    const spent = usage.spent
    const pct = row.limit_usd > 0 ? (spent / row.limit_usd) * 100 : 0

    return {
      id: row.id,
      name: row.name,
      period: row.period as BudgetPeriod,
      limit_usd: row.limit_usd,
      enforcement: row.enforcement as Budget['enforcement'],
      project_id: row.project_id ?? undefined,
      model: row.model ?? undefined,
      provider: row.provider ?? undefined,
      current_spend_usd: Math.round(spent * 1_000_000) / 1_000_000,
      percent_used: Math.round(pct * 100) / 100,
      period_start: start,
      period_end: end,
    }
  }

  // ═══════════════════════════════════════════════════════
  // DASHBOARD STATS
  // ═══════════════════════════════════════════════════════

  /** Quick stats for the cost dashboard. */
  getDashboardStats(): {
    total_logs: number
    total_cost_usd: number
    total_tokens: number
    models_used: number
    cost_today_usd: number
    cost_this_week_usd: number
    top_models: Array<{ model: string; cost_usd: number; requests: number }>
    error_rate: number
  } {
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const totals = this.db
      .prepare(
        `SELECT
          COUNT(*) as total_logs,
          COALESCE(SUM(cost_total_usd), 0) as total_cost,
          COALESCE(SUM(tokens_total), 0) as total_tokens,
          COUNT(DISTINCT model) as models_used,
          COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as error_rate
        FROM llm_logs`,
      )
      .get() as {
        total_logs: number
        total_cost: number
        total_tokens: number
        models_used: number
        error_rate: number
      }

    const costToday = this.db
      .prepare("SELECT COALESCE(SUM(cost_total_usd), 0) as c FROM llm_logs WHERE timestamp >= ?")
      .get(today) as { c: number }

    const costWeek = this.db
      .prepare("SELECT COALESCE(SUM(cost_total_usd), 0) as c FROM llm_logs WHERE timestamp >= ?")
      .get(weekAgo) as { c: number }

    const topModels = this.db
      .prepare(
        `SELECT model, SUM(cost_total_usd) as cost, COUNT(*) as requests
         FROM llm_logs GROUP BY model ORDER BY cost DESC LIMIT 10`,
      )
      .all() as Array<{ model: string; cost: number; requests: number }>

    return {
      total_logs: totals.total_logs,
      total_cost_usd: totals.total_cost,
      total_tokens: totals.total_tokens,
      models_used: totals.models_used,
      cost_today_usd: costToday.c,
      cost_this_week_usd: costWeek.c,
      top_models: topModels.map((m) => ({
        model: m.model,
        cost_usd: m.cost,
        requests: m.requests,
      })),
      error_rate: Math.round(totals.error_rate * 100) / 100,
    }
  }
}

// ── Helpers ──

function getPeriodBounds(period: BudgetPeriod): { start: string; end: string } {
  const now = new Date()
  let start: Date
  const end = now

  switch (period) {
    case 'hourly':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
      break
    case 'daily':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'weekly': {
      const day = now.getDay()
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      break
    }
    case 'monthly':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

// ── DB row types ──

interface LogRow {
  id: string
  trace_id: string | null
  session_id: string | null
  request_id: string | null
  timestamp: string
  timestamp_response: string | null
  provider: string
  provider_raw: string | null
  model: string
  model_raw: string | null
  request_type: string
  streaming: number
  temperature: number | null
  max_tokens: number | null
  tokens_input: number
  tokens_output: number
  tokens_total: number
  tokens_cached_input: number
  tokens_reasoning: number
  tokens_image: number
  tokens_audio: number
  cost_input_usd: number
  cost_output_usd: number
  cost_total_usd: number
  cost_cached_discount_usd: number
  pricing_version: string | null
  cost_is_estimated: number
  latency_total_ms: number
  latency_ttft_ms: number | null
  latency_queue_ms: number | null
  status: string
  error_code: string | null
  error_message: string | null
  prompt_hash: string | null
  response_hash: string | null
  finish_reason: string | null
  project_id: string | null
  user_id: string | null
  agent_id: string | null
  environment: string | null
  tags: string
}

function logRowToRecord(row: LogRow): LLMLogRecord {
  return {
    id: row.id,
    trace_id: row.trace_id ?? undefined,
    session_id: row.session_id ?? undefined,
    request_id: row.request_id ?? undefined,
    timestamp: row.timestamp,
    timestamp_response: row.timestamp_response ?? undefined,
    provider: row.provider as LLMProvider,
    provider_raw: row.provider_raw ?? undefined,
    model: row.model,
    model_raw: row.model_raw ?? undefined,
    request_type: row.request_type as LLMLogRecord['request_type'],
    streaming: !!row.streaming,
    temperature: row.temperature ?? undefined,
    max_tokens: row.max_tokens ?? undefined,
    tokens: {
      input: row.tokens_input,
      output: row.tokens_output,
      total: row.tokens_total,
      cached_input: row.tokens_cached_input,
      reasoning: row.tokens_reasoning,
      image_tokens: row.tokens_image,
      audio_tokens: row.tokens_audio,
    },
    cost: {
      input_cost_usd: row.cost_input_usd,
      output_cost_usd: row.cost_output_usd,
      total_cost_usd: row.cost_total_usd,
      cached_discount_usd: row.cost_cached_discount_usd,
      pricing_version: row.pricing_version ?? '',
      is_estimated: !!row.cost_is_estimated,
    },
    latency: {
      total_ms: row.latency_total_ms,
      time_to_first_token_ms: row.latency_ttft_ms,
      queue_time_ms: row.latency_queue_ms ?? 0,
    },
    status: row.status as LLMLogRecord['status'],
    error_code: row.error_code ?? undefined,
    error_message: row.error_message ?? undefined,
    prompt_hash: row.prompt_hash ?? undefined,
    response_hash: row.response_hash ?? undefined,
    finish_reason: row.finish_reason ?? undefined,
    project_id: row.project_id ?? undefined,
    user_id: row.user_id ?? undefined,
    agent_id: row.agent_id ?? undefined,
    environment: row.environment ?? undefined,
    tags: JSON.parse(row.tags || '{}'),
  }
}

interface BudgetRow {
  id: string
  name: string
  period: string
  limit_usd: number
  enforcement: string
  project_id: string | null
  model: string | null
  provider: string | null
  created_at: string
  updated_at: string
}
