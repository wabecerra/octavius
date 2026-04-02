/**
 * Trace Capture Hooks — pre/post tool hooks that record events into the trace store.
 */

import type { HookContext, HookRegistration } from './hooks'
import { recordToolCall, recordHookAbort, hasActiveTrace } from './trace-store'

/** Pre-tool hook: record start timestamp for duration calculation */
function traceCapturePreHook(ctx: HookContext): HookContext {
  ctx.meta.traceToolStart = Date.now()

  // If another hook already aborted, record that in the trace
  if (ctx.abort && hasActiveTrace(ctx.session.sessionKey)) {
    recordHookAbort(ctx.session.sessionKey, ctx.abort.reason)
  }

  return ctx
}

/** Post-tool hook: record the complete tool call to the trace */
function traceCapturePostHook(ctx: HookContext): HookContext {
  if (!hasActiveTrace(ctx.session.sessionKey)) return ctx

  const startTime = (ctx.meta.traceToolStart as number) ?? Date.now()
  const durationMs = Date.now() - startTime

  recordToolCall(ctx.session.sessionKey, {
    toolName: ctx.toolName,
    params: ctx.params,
    result: ctx.result !== undefined
      ? (typeof ctx.result === 'string' ? ctx.result : JSON.stringify(ctx.result))
      : undefined,
    aborted: ctx.abort?.reason,
    durationMs,
    timestamp: ctx.timestamp,
  })

  return ctx
}

export const TRACE_CAPTURE_HOOKS: HookRegistration[] = [
  {
    id: 'trace-capture-pre',
    name: 'Trace Capture (Pre)',
    phase: 'pre_tool',
    priority: 25, // After rate-limit (20), before tool execution
    fn: traceCapturePreHook,
  },
  {
    id: 'trace-capture-post',
    name: 'Trace Capture (Post)',
    phase: 'post_tool',
    priority: 120, // After cost-track (110)
    fn: traceCapturePostHook,
  },
]
