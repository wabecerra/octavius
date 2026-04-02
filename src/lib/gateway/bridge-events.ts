import type { GatewayFrame } from '@/lib/town/ws-gateway'

export enum AgentEventType {
  STARTED = 'agent.started',
  STREAMING = 'agent.streaming',
  TOOL_CALL = 'agent.tool_call',
  TOOL_RESULT = 'agent.tool_result',
  SPAWNED = 'agent.spawned',
  COMPLETED = 'agent.completed',
  FAILED = 'agent.failed',
  APPROVAL_NEEDED = 'agent.approval_needed',
  PERMISSION_NEEDED = 'harness.permission_needed',
  PERMISSION_RESOLVED = 'harness.permission_resolved',
  SCOPE_DENIED = 'harness.scope_denied',
  SESSION_COMPACTED = 'harness.session_compacted',
  HOOK_DENIED = 'harness.hook_denied',
}

export interface AgentEvent {
  type: AgentEventType
  agentId?: string
  runId?: string
  sessionKey?: string
  text?: string
  toolName?: string
  toolResult?: string
  taskId?: string
  timestamp: string
}

export type BridgeStatus = 'UNKNOWN' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'AUTH_FAILED'

export interface FleetAgentState {
  id: string
  type: string
  status: 'running' | 'idle' | 'done' | 'failed' | 'empty'
  currentTask?: string
  currentTaskId?: string
  runId?: string
  sessionKey?: string
  spawnedAt?: string
}

/** Map OpenClaw session key → canonical fleet agent ID */
export function sessionKeyToAgentId(sessionKey: string): string {
  if (sessionKey === 'agent:main') return 'orchestrator'
  const m = sessionKey.match(/^subagent:(.+)$/)
  if (!m) return sessionKey
  const rest = m[1]
  const specMatch = rest.match(/^(specialist-\w+)-(.+)$/)
  if (specMatch) return `${specMatch[1]}:${specMatch[2]}`
  return rest
}

export function translateGatewayEvent(frame: GatewayFrame): AgentEvent | null {
  const now = new Date().toISOString()
  const p = (frame.payload ?? {}) as Record<string, unknown>

  if (frame.event === 'agent') {
    const agentId = sessionKeyToAgentId((p.sessionKey as string) ?? '')
    const base = { agentId, runId: p.runId as string, sessionKey: p.sessionKey as string, timestamp: now }
    switch (p.phase) {
      case 'start': return { ...base, type: AgentEventType.STARTED }
      case 'end':   return { ...base, type: AgentEventType.COMPLETED }
      case 'error': return { ...base, type: AgentEventType.FAILED }
    }
  }

  if (frame.event === 'chat') {
    const base = { runId: p.runId as string, sessionKey: p.sessionId as string, timestamp: now }
    switch (p.state) {
      case 'delta':   return { ...base, type: AgentEventType.STREAMING, text: p.text as string }
      case 'final':   return { ...base, type: AgentEventType.COMPLETED }
      case 'error':   return { ...base, type: AgentEventType.FAILED }
      case 'aborted': return { ...base, type: AgentEventType.FAILED }
    }
  }

  return null
}
