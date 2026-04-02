/**
 * Trace Store — collects execution traces in memory during agent runs
 * and persists them to SQLite on completion.
 */

import { randomUUID } from 'crypto'
import { createHash } from 'crypto'
import { getDatabase } from '@/lib/memory/db'
import type {
  ExecutionTrace,
  TraceOutcome,
  ToolCallRecord,
  LLMResponseRecord,
} from './trace-types'

const activeTraces = new Map<string, ExecutionTrace>()

/** Begin a new trace for a session */
export function beginTrace(
  sessionKey: string,
  agentId: string,
  agentType: string,
  opts?: { taskId?: string; taskTitle?: string; promptText?: string; permissionLevel?: number; toolScope?: string[] },
): string {
  const traceId = randomUUID()
  const promptText = opts?.promptText ?? ''
  const trace: ExecutionTrace = {
    traceId,
    sessionKey,
    agentId,
    agentType,
    permissionLevel: opts?.permissionLevel ?? 1,
    toolScope: opts?.toolScope ?? [],
    promptHash: createHash('sha256').update(promptText).digest('hex'),
    promptSummary: promptText.slice(0, 500),
    taskId: opts?.taskId,
    taskTitle: opts?.taskTitle,
    toolCalls: [],
    llmResponses: [],
    outcome: 'partial', // Will be updated on finalize
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    durationMs: 0,
    toolCallCount: 0,
    compactionCount: 0,
    hooksAborted: [],
    startedAt: new Date().toISOString(),
  }
  activeTraces.set(sessionKey, trace)
  return traceId
}

/** Record a tool call event */
export function recordToolCall(sessionKey: string, record: ToolCallRecord): void {
  const trace = activeTraces.get(sessionKey)
  if (!trace) return
  // Truncate large params/results for storage
  const truncated: ToolCallRecord = {
    ...record,
    params: truncateObj(record.params, 1024),
    result: record.result?.slice(0, 2048),
  }
  trace.toolCalls.push(truncated)
  trace.toolCallCount = trace.toolCalls.length
}

/** Record an LLM response */
export function recordLLMResponse(sessionKey: string, record: LLMResponseRecord): void {
  const trace = activeTraces.get(sessionKey)
  if (!trace) return
  trace.llmResponses.push(record)
  trace.promptTokens += record.promptTokens
  trace.completionTokens += record.completionTokens
  trace.totalTokens += record.promptTokens + record.completionTokens
  trace.costUsd += record.costUsd
}

/** Record a hook abort */
export function recordHookAbort(sessionKey: string, reason: string): void {
  const trace = activeTraces.get(sessionKey)
  if (!trace) return
  trace.hooksAborted.push(reason)
}

/** Finalize and persist a trace to SQLite */
export function finalizeTrace(
  sessionKey: string,
  result: {
    outcome: TraceOutcome
    outcomeReason?: string
    model?: string
    provider?: string
  },
): ExecutionTrace | null {
  const trace = activeTraces.get(sessionKey)
  if (!trace) return null

  trace.outcome = result.outcome
  trace.outcomeReason = result.outcomeReason
  trace.model = result.model
  trace.provider = result.provider
  trace.completedAt = new Date().toISOString()
  trace.durationMs = new Date(trace.completedAt).getTime() - new Date(trace.startedAt).getTime()

  // Persist to SQLite
  try {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO execution_traces (
        trace_id, session_key, agent_id, agent_type, permission_level, tool_scope,
        prompt_hash, prompt_summary, task_id, task_title,
        tool_calls, llm_responses,
        outcome, outcome_reason,
        total_tokens, prompt_tokens, completion_tokens, cost_usd, duration_ms,
        tool_call_count, compaction_count, hooks_aborted,
        started_at, completed_at, model, provider
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trace.traceId, trace.sessionKey, trace.agentId, trace.agentType,
      trace.permissionLevel, JSON.stringify(trace.toolScope),
      trace.promptHash, trace.promptSummary,
      trace.taskId ?? null, trace.taskTitle ?? null,
      JSON.stringify(trace.toolCalls), JSON.stringify(trace.llmResponses),
      trace.outcome, trace.outcomeReason ?? null,
      trace.totalTokens, trace.promptTokens, trace.completionTokens,
      trace.costUsd, trace.durationMs,
      trace.toolCallCount, trace.compactionCount,
      JSON.stringify(trace.hooksAborted),
      trace.startedAt, trace.completedAt,
      trace.model ?? null, trace.provider ?? null,
    )
  } catch (err) {
    console.error('[trace-store] Failed to persist trace:', (err as Error).message)
  }

  activeTraces.delete(sessionKey)
  return trace
}

/** Check if a session has an active trace */
export function hasActiveTrace(sessionKey: string): boolean {
  return activeTraces.has(sessionKey)
}

/** Get a trace by ID from SQLite */
export function getTrace(traceId: string): ExecutionTrace | null {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM execution_traces WHERE trace_id = ?').get(traceId) as Record<string, unknown> | undefined
    if (!row) return null
    return rowToTrace(row)
  } catch {
    return null
  }
}

/** Query traces with filters */
export function queryTraces(filters: {
  agentType?: string
  outcome?: TraceOutcome
  since?: string
  until?: string
  limit?: number
  offset?: number
}): { traces: ExecutionTrace[]; total: number } {
  try {
    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.agentType) {
      conditions.push('agent_type = ?')
      params.push(filters.agentType)
    }
    if (filters.outcome) {
      conditions.push('outcome = ?')
      params.push(filters.outcome)
    }
    if (filters.since) {
      conditions.push('started_at >= ?')
      params.push(filters.since)
    }
    if (filters.until) {
      conditions.push('started_at <= ?')
      params.push(filters.until)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0

    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM execution_traces ${where}`).get(...params) as { cnt: number }
    const rows = db.prepare(`SELECT * FROM execution_traces ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[]

    return {
      traces: rows.map(rowToTrace),
      total: countRow.cnt,
    }
  } catch {
    return { traces: [], total: 0 }
  }
}

/** Compute aggregate statistics for the proposer */
export function getTraceStats(since: string): {
  byAgentType: Array<{
    agentType: string
    total: number
    success: number
    failure: number
    timeout: number
    avgCostUsd: number
    avgDurationMs: number
    avgToolCalls: number
  }>
  hookAborts: Array<{
    agentType: string
    reason: string
    count: number
    exampleTraceIds: string[]
  }>
  topCostTraces: Array<{
    traceId: string
    agentId: string
    taskTitle: string
    costUsd: number
    totalTokens: number
    outcome: string
  }>
} {
  try {
    const db = getDatabase()

    // By agent type
    const byAgentType = db.prepare(`
      SELECT agent_type,
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure,
        SUM(CASE WHEN outcome = 'timeout' THEN 1 ELSE 0 END) as timeout,
        AVG(cost_usd) as avg_cost,
        AVG(duration_ms) as avg_duration,
        AVG(tool_call_count) as avg_tools
      FROM execution_traces WHERE started_at >= ?
      GROUP BY agent_type
    `).all(since) as Array<Record<string, unknown>>

    // Top cost traces
    const topCost = db.prepare(`
      SELECT trace_id, agent_id, task_title, cost_usd, total_tokens, outcome
      FROM execution_traces WHERE started_at >= ?
      ORDER BY cost_usd DESC LIMIT 10
    `).all(since) as Array<Record<string, unknown>>

    return {
      byAgentType: byAgentType.map(r => ({
        agentType: r.agent_type as string,
        total: r.total as number,
        success: r.success as number,
        failure: r.failure as number,
        timeout: r.timeout as number,
        avgCostUsd: r.avg_cost as number,
        avgDurationMs: r.avg_duration as number,
        avgToolCalls: r.avg_tools as number,
      })),
      hookAborts: [], // Computed from traces in the proposer itself
      topCostTraces: topCost.map(r => ({
        traceId: r.trace_id as string,
        agentId: r.agent_id as string,
        taskTitle: (r.task_title as string) || '',
        costUsd: r.cost_usd as number,
        totalTokens: r.total_tokens as number,
        outcome: r.outcome as string,
      })),
    }
  } catch {
    return { byAgentType: [], hookAborts: [], topCostTraces: [] }
  }
}

/** Clean old traces */
export function cleanOldTraces(olderThanDays: number = 30): number {
  try {
    const db = getDatabase()
    const result = db.prepare(
      `DELETE FROM execution_traces WHERE started_at < datetime('now', '-' || ? || ' days')`
    ).run(olderThanDays)
    return result.changes
  } catch {
    return 0
  }
}

// ── Helpers ──

function rowToTrace(row: Record<string, unknown>): ExecutionTrace {
  return {
    traceId: row.trace_id as string,
    sessionKey: row.session_key as string,
    agentId: row.agent_id as string,
    agentType: row.agent_type as string,
    permissionLevel: row.permission_level as number,
    toolScope: JSON.parse((row.tool_scope as string) || '[]'),
    promptHash: row.prompt_hash as string,
    promptSummary: row.prompt_summary as string,
    taskId: row.task_id as string | undefined,
    taskTitle: row.task_title as string | undefined,
    toolCalls: JSON.parse((row.tool_calls as string) || '[]'),
    llmResponses: JSON.parse((row.llm_responses as string) || '[]'),
    outcome: row.outcome as TraceOutcome,
    outcomeReason: row.outcome_reason as string | undefined,
    totalTokens: row.total_tokens as number,
    promptTokens: row.prompt_tokens as number,
    completionTokens: row.completion_tokens as number,
    costUsd: row.cost_usd as number,
    durationMs: row.duration_ms as number,
    toolCallCount: row.tool_call_count as number,
    compactionCount: row.compaction_count as number,
    hooksAborted: JSON.parse((row.hooks_aborted as string) || '[]'),
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
    model: row.model as string | undefined,
    provider: row.provider as string | undefined,
  }
}

function truncateObj(obj: Record<string, unknown>, maxLen: number): Record<string, unknown> {
  const str = JSON.stringify(obj)
  if (str.length <= maxLen) return obj
  try {
    return JSON.parse(str.slice(0, maxLen - 1) + '}')
  } catch {
    return { _truncated: true, _preview: str.slice(0, 200) }
  }
}
