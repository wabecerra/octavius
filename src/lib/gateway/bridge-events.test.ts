import { describe, it, expect } from 'vitest'
import {
  AgentEventType,
  AgentEvent,
  BridgeStatus,
  FleetAgentState,
  sessionKeyToAgentId,
  translateGatewayEvent,
} from './bridge-events'
import type { GatewayFrame } from '@/lib/town/ws-gateway'

describe('sessionKeyToAgentId', () => {
  it('converts agent:main to orchestrator', () => {
    expect(sessionKeyToAgentId('agent:main')).toBe('orchestrator')
  })

  it('converts subagent:gen-industry to gen-industry', () => {
    expect(sessionKeyToAgentId('subagent:gen-industry')).toBe('gen-industry')
  })

  it('converts specialist with hyphen pattern', () => {
    expect(sessionKeyToAgentId('subagent:specialist-coder-abc123')).toBe(
      'specialist-coder:abc123'
    )
  })

  it('handles plain subagent without specialist pattern', () => {
    expect(sessionKeyToAgentId('subagent:architect')).toBe('architect')
  })

  it('returns original key if it does not match patterns', () => {
    expect(sessionKeyToAgentId('unknown-key')).toBe('unknown-key')
  })
})

describe('translateGatewayEvent', () => {
  it('translates agent start event', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'agent',
      payload: {
        phase: 'start',
        sessionKey: 'agent:main',
        runId: 'run-123',
      },
    }
    const now = new Date().toISOString()
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.STARTED)
    expect(event?.agentId).toBe('orchestrator')
    expect(event?.runId).toBe('run-123')
    expect(event?.sessionKey).toBe('agent:main')
    expect(event?.timestamp).toBeDefined()
  })

  it('translates agent end event', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'agent',
      payload: {
        phase: 'end',
        sessionKey: 'subagent:gen-industry',
        runId: 'run-456',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.COMPLETED)
    expect(event?.agentId).toBe('gen-industry')
    expect(event?.runId).toBe('run-456')
  })

  it('translates agent error event', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'agent',
      payload: {
        phase: 'error',
        sessionKey: 'agent:main',
        runId: 'run-789',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.FAILED)
  })

  it('translates chat delta event', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'chat',
      payload: {
        state: 'delta',
        runId: 'run-chat-1',
        sessionId: 'session-xyz',
        text: 'Hello world',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.STREAMING)
    expect(event?.text).toBe('Hello world')
    expect(event?.runId).toBe('run-chat-1')
    expect(event?.sessionKey).toBe('session-xyz')
  })

  it('translates chat final event', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'chat',
      payload: {
        state: 'final',
        runId: 'run-chat-2',
        sessionId: 'session-abc',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.COMPLETED)
  })

  it('translates chat error event', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'chat',
      payload: {
        state: 'error',
        runId: 'run-chat-3',
        sessionId: 'session-def',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.FAILED)
  })

  it('translates chat aborted event to FAILED', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'chat',
      payload: {
        state: 'aborted',
        runId: 'run-chat-4',
        sessionId: 'session-ghi',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeDefined()
    expect(event?.type).toBe(AgentEventType.FAILED)
  })

  it('returns null for unknown event type', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'unknown',
      payload: {},
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeNull()
  })

  it('returns null for agent event with unknown phase', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'agent',
      payload: {
        phase: 'unknown',
        sessionKey: 'agent:main',
        runId: 'run-999',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeNull()
  })

  it('returns null for chat event with unknown state', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'chat',
      payload: {
        state: 'unknown',
        runId: 'run-chat-5',
        sessionId: 'session-jkl',
      },
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeNull()
  })

  it('handles missing payload gracefully', () => {
    const frame: GatewayFrame = {
      type: 'event',
      event: 'agent',
    }
    const event = translateGatewayEvent(frame)
    expect(event).toBeNull()
  })
})
