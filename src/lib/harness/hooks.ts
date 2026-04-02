/**
 * Hook Pipeline — pre/post tool execution hooks for validation, logging, rate limiting.
 * Inspired by claw-code's HookRunner with pre_tool_use and post_tool_use.
 */

import type { HarnessSession } from './types'
import { checkPermission } from './permissions'
import { isToolInScope } from './tool-scopes'
import { getDatabase } from '@/lib/memory/db'
// Note: TRACE_CAPTURE_HOOKS imported lazily in getHookPipeline() to avoid circular dependency
// (trace-capture-hook imports HookContext/HookRegistration from this file)
import type { RateLimitConfigPayload } from './trace-types'

export type HookPhase = 'pre_tool' | 'post_tool'

export interface HookContext {
  session: HarnessSession
  toolName: string
  phase: HookPhase
  params: Record<string, unknown>
  result?: unknown
  abort?: { reason: string }
  meta: Record<string, unknown>
  timestamp: string
}

export type HookFn = (ctx: HookContext) => HookContext | Promise<HookContext>

export interface HookRegistration {
  id: string
  name: string
  phase: HookPhase
  toolFilter?: string | string[]
  priority: number
  fn: HookFn
}

// ── Built-in hook implementations ──

/** Scope enforcement: reject tools outside the agent's whitelist */
function scopeCheckHook(ctx: HookContext): HookContext {
  if (!isToolInScope(ctx.session.agentType, ctx.toolName)) {
    ctx.abort = {
      reason: `Tool '${ctx.toolName}' is not available for ${ctx.session.agentType} agents`,
    }
  }
  return ctx
}

/** Permission check: reject tools above the agent's permission level */
function permissionCheckHook(ctx: HookContext): HookContext {
  const gate = checkPermission(ctx.session, ctx.toolName)
  if (!gate.allowed) {
    ctx.abort = { reason: gate.reason! }
  }
  return ctx
}

/** Rate limiter with policy-driven overrides per agent type */
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000
const DEFAULT_RATE_LIMIT_MAX = 20
const rateCounts = new Map<string, { count: number; windowStart: number }>()

/** Lazy reference to policy-store to avoid circular dependency */
let _getActivePolicies: typeof import('./policy-store').getActivePolicies | null = null
function lazyGetActivePolicies() {
  if (!_getActivePolicies) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _getActivePolicies = (require('./policy-store') as typeof import('./policy-store')).getActivePolicies
  }
  return _getActivePolicies
}

function getRateLimitConfig(agentType: string): { windowMs: number; maxCalls: number } {
  const policies = lazyGetActivePolicies()('rate_limit_config', agentType)
  if (policies.length > 0) {
    const payload = policies[0].payload as RateLimitConfigPayload
    return {
      windowMs: payload.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
      maxCalls: payload.maxCalls ?? DEFAULT_RATE_LIMIT_MAX,
    }
  }
  // Also check for a global (non-agent-specific) rate limit policy
  const globalPolicies = lazyGetActivePolicies()('rate_limit_config')
  for (const p of globalPolicies) {
    const payload = p.payload as RateLimitConfigPayload
    if (!payload.perAgentType) {
      return {
        windowMs: payload.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
        maxCalls: payload.maxCalls ?? DEFAULT_RATE_LIMIT_MAX,
      }
    }
  }
  return { windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS, maxCalls: DEFAULT_RATE_LIMIT_MAX }
}

function rateLimitHook(ctx: HookContext): HookContext {
  const key = ctx.session.sessionKey
  const now = Date.now()
  const { windowMs, maxCalls } = getRateLimitConfig(ctx.session.agentType)
  let entry = rateCounts.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now }
    rateCounts.set(key, entry)
  }

  entry.count++
  if (entry.count > maxCalls) {
    ctx.abort = { reason: `Rate limit exceeded: ${maxCalls} tool calls per ${Math.round(windowMs / 1000)}s` }
  }
  return ctx
}

/** Audit logger: log tool executions to SQLite */
function auditLogHook(ctx: HookContext): HookContext {
  try {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      ctx.session.sessionKey,
      ctx.session.agentId,
      `tool:${ctx.toolName}`,
      JSON.stringify({
        phase: ctx.phase,
        aborted: !!ctx.abort,
        ...(ctx.phase === 'post_tool' ? { hasResult: ctx.result !== undefined } : {}),
      }).slice(0, 500),
      ctx.timestamp,
    )
  } catch {
    // Non-critical, don't fail the tool call
  }
  return ctx
}

/** Cost tracker: estimate and accumulate token usage */
function costTrackHook(ctx: HookContext): HookContext {
  if (ctx.phase === 'post_tool' && ctx.result) {
    const resultStr = typeof ctx.result === 'string' ? ctx.result : JSON.stringify(ctx.result)
    const tokens = Math.ceil(resultStr.length / 4)
    ctx.session.tokenUsed += tokens
    ctx.meta.estimatedTokens = tokens
  }
  return ctx
}

/** Built-in hooks in priority order (trace capture hooks added lazily to break circular import) */
export const BUILTIN_HOOKS: HookRegistration[] = [
  { id: 'scope-check', name: 'Tool Scope Check', phase: 'pre_tool', priority: 0, fn: scopeCheckHook },
  { id: 'permission-check', name: 'Permission Check', phase: 'pre_tool', priority: 10, fn: permissionCheckHook },
  { id: 'rate-limit', name: 'Rate Limiter', phase: 'pre_tool', priority: 20, fn: rateLimitHook },
  // trace capture hooks (pre at 25, post at 120) registered in getHookPipeline()
  { id: 'audit-log', name: 'Audit Logger', phase: 'post_tool', priority: 100, fn: auditLogHook },
  { id: 'cost-track', name: 'Cost Tracker', phase: 'post_tool', priority: 110, fn: costTrackHook },
]

export class HookPipeline {
  private hooks: HookRegistration[]

  constructor(builtins: HookRegistration[] = BUILTIN_HOOKS) {
    this.hooks = [...builtins]
  }

  register(hook: HookRegistration): void {
    this.hooks.push(hook)
    this.hooks.sort((a, b) => a.priority - b.priority)
  }

  unregister(hookId: string): void {
    this.hooks = this.hooks.filter(h => h.id !== hookId)
  }

  listHooks(): Array<{ id: string; name: string; phase: HookPhase; priority: number }> {
    return this.hooks.map(h => ({ id: h.id, name: h.name, phase: h.phase, priority: h.priority }))
  }

  async run(phase: HookPhase, ctx: HookContext): Promise<HookContext> {
    const phaseHooks = this.hooks.filter(h => h.phase === phase)
    let current = ctx

    for (const hook of phaseHooks) {
      // Check tool filter
      if (hook.toolFilter) {
        const filters = Array.isArray(hook.toolFilter) ? hook.toolFilter : [hook.toolFilter]
        if (!filters.includes(current.toolName)) continue
      }

      current = await hook.fn(current)

      // If a pre-hook aborted, stop the pipeline
      if (phase === 'pre_tool' && current.abort) break
    }

    return current
  }
}

// Singleton
let pipelineInstance: HookPipeline | undefined

export function getHookPipeline(): HookPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new HookPipeline()
    // Lazily register trace capture hooks to break circular import chain
    // (trace-capture-hook.ts imports HookContext/HookRegistration from this file)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TRACE_CAPTURE_HOOKS } = require('./trace-capture-hook') as typeof import('./trace-capture-hook')
      for (const hook of TRACE_CAPTURE_HOOKS) {
        pipelineInstance.register(hook)
      }
    } catch {
      // Trace capture unavailable — non-critical
    }
  }
  return pipelineInstance
}
