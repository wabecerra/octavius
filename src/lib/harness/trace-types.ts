/**
 * Phase 3: Self-Evolution Layer — type definitions for execution traces,
 * versioned policies, and the proposer agent.
 */

/** Record of a single tool call within a trace */
export interface ToolCallRecord {
  toolName: string
  params: Record<string, unknown>
  result?: string
  aborted?: string
  durationMs: number
  timestamp: string
}

/** Record of an LLM response within a trace */
export interface LLMResponseRecord {
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  durationMs: number
  fallbackUsed?: string
  hasToolCalls: boolean
  timestamp: string
}

export type TraceOutcome = 'success' | 'failure' | 'timeout' | 'aborted' | 'partial'

export interface ExecutionTrace {
  traceId: string
  sessionKey: string
  agentId: string
  agentType: string
  permissionLevel: number
  toolScope: string[]
  promptHash: string
  promptSummary: string
  taskId?: string
  taskTitle?: string
  toolCalls: ToolCallRecord[]
  llmResponses: LLMResponseRecord[]
  outcome: TraceOutcome
  outcomeReason?: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  costUsd: number
  durationMs: number
  toolCallCount: number
  compactionCount: number
  hooksAborted: string[]
  startedAt: string
  completedAt?: string
  model?: string
  provider?: string
}

export type PolicyType =
  | 'tool_scope_override'
  | 'permission_override'
  | 'routing_hint'
  | 'compaction_config'
  | 'rate_limit_config'
  | 'prompt_hint'

export type PolicyStatus =
  | 'proposed'
  | 'staged'
  | 'active'
  | 'rejected'
  | 'superseded'
  | 'rolled_back'

export interface ToolScopeOverridePayload {
  agentType: string
  addTools?: string[]
  removeTools?: string[]
}

export interface PermissionOverridePayload {
  agentType: string
  newLevel: number
}

export interface RoutingHintPayload {
  taskPattern: string
  preferredAgentType: string
  confidence: number
}

export interface CompactionConfigPayload {
  thresholdPct?: number
  preserveRecentCount?: number
  summaryModel?: string
}

export interface RateLimitConfigPayload {
  windowMs?: number
  maxCalls?: number
  perAgentType?: string
}

export interface PromptHintPayload {
  agentType: string
  section: 'system' | 'tools' | 'context'
  hint: string
}

export type PolicyPayload =
  | ToolScopeOverridePayload
  | PermissionOverridePayload
  | RoutingHintPayload
  | CompactionConfigPayload
  | RateLimitConfigPayload
  | PromptHintPayload

export interface EvolutionPolicy {
  policyId: string
  version: number
  policyType: PolicyType
  target: string
  payload: PolicyPayload
  reason: string
  evidence: string[]
  status: PolicyStatus
  proposedAt: string
  reviewedAt?: string
  activatedAt?: string
  rolledBackAt?: string
  impactSummary?: Record<string, unknown>
}

export interface ProposerRun {
  runId: string
  trigger: 'cron' | 'manual' | 'event'
  startedAt: string
  completedAt?: string
  tracesAnalyzed: number
  proposalsGenerated: number
  model?: string
  costUsd: number
  summary: string
  error?: string
}

export interface ProposerOutput {
  findings: Array<{
    pattern: string
    severity: 'low' | 'medium' | 'high'
    traceIds: string[]
    description: string
  }>
  proposals: Array<{
    policyType: PolicyType
    target: string
    payload: PolicyPayload
    reason: string
    traceIds: string[]
  }>
  summary: string
}
