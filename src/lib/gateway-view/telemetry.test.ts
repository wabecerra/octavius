/**
 * Unit tests for TelemetryPipeline
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelemetryPipeline } from './telemetry'
import type { TelemetryEvent, PollingSource } from './types'
import type { GatewayEventMap } from './events'

// ---------------------------------------------------------------------------
// Minimal GatewayEventBus stub
// ---------------------------------------------------------------------------

type Listener<T extends unknown[]> = (...args: T) => void

function makeBus() {
  const listeners = new Map<string, Set<Listener<unknown[]>>>()
  const emitted: Array<{ event: string; args: unknown[] }> = []

  return {
    emitted,
    on<K extends keyof GatewayEventMap>(event: K, fn: Listener<GatewayEventMap[K]>) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(fn as Listener<unknown[]>)
      return () => listeners.get(event)?.delete(fn as Listener<unknown[]>)
    },
    off() {},
    emit<K extends keyof GatewayEventMap>(event: K, ...args: GatewayEventMap[K]) {
      emitted.push({ event, args })
      listeners.get(event)?.forEach((fn) => fn(...args))
    },
  }
}

// ---------------------------------------------------------------------------
// Minimal WsGatewayClient stub
// ---------------------------------------------------------------------------

function makeWsClient() {
  const eventHandlers = new Map<string, Set<(payload: unknown) => void>>()
  const statusHandlers = new Set<(status: string) => void>()

  return {
    on(event: string, fn: (payload: unknown) => void) {
      if (!eventHandlers.has(event)) eventHandlers.set(event, new Set())
      eventHandlers.get(event)!.add(fn)
      return () => eventHandlers.get(event)?.delete(fn)
    },
    onStatus(fn: (status: string) => void) {
      statusHandlers.add(fn)
      return () => statusHandlers.delete(fn)
    },
    // Test helpers
    _triggerEvent(event: string, payload: unknown) {
      eventHandlers.get(event)?.forEach((fn) => fn(payload))
    },
    _triggerStatus(status: string) {
      statusHandlers.forEach((fn) => fn(status))
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelemetryPipeline', () => {
  let bus: ReturnType<typeof makeBus>
  let pipeline: TelemetryPipeline

  beforeEach(() => {
    bus = makeBus()
    pipeline = new TelemetryPipeline(bus as never)
  })

  afterEach(() => {
    pipeline.destroy()
  })

  // ---- emit + dedup (Req 7.1, 7.4) ----------------------------------------

  it('emits a TelemetryEvent on the bus', () => {
    const event: TelemetryEvent = {
      eventId: 'e1',
      type: 'agent-dispatch',
      subsystem: 'room-agents',
      timestamp: new Date().toISOString(),
      summary: 'Agent dispatched',
    }
    pipeline.emit(event)
    expect(bus.emitted).toHaveLength(1)
    expect(bus.emitted[0].event).toBe('telemetry-event')
    expect((bus.emitted[0].args[0] as TelemetryEvent).eventId).toBe('e1')
  })

  it('deduplicates events with the same eventId within the window', () => {
    const event: TelemetryEvent = {
      eventId: 'dup-1',
      type: 'memory-write',
      subsystem: 'room-memory',
      timestamp: new Date().toISOString(),
      summary: 'Memory write',
    }
    pipeline.emit(event)
    pipeline.emit(event)
    pipeline.emit({ ...event })
    expect(bus.emitted).toHaveLength(1)
  })

  it('allows the same eventId after the dedup window expires', () => {
    vi.useFakeTimers()
    const event: TelemetryEvent = {
      eventId: 'exp-1',
      type: 'task-create',
      subsystem: 'room-tasks',
      timestamp: new Date().toISOString(),
      summary: 'Task created',
    }
    pipeline.emit(event)
    expect(bus.emitted).toHaveLength(1)

    // Advance past the 5-second window
    vi.advanceTimersByTime(6_000)

    pipeline.emit({ ...event, timestamp: new Date().toISOString() })
    expect(bus.emitted).toHaveLength(2)

    vi.useRealTimers()
  })

  it('allows different eventIds through without dedup', () => {
    for (let i = 0; i < 5; i++) {
      pipeline.emit({
        eventId: `unique-${i}`,
        type: 'cost-update',
        subsystem: 'room-costs',
        timestamp: new Date().toISOString(),
        summary: `Cost update ${i}`,
      })
    }
    expect(bus.emitted).toHaveLength(5)
  })

  // ---- WebSocket attachment (Req 7.2, 7.3) ---------------------------------

  it('transforms a WS agent-dispatch frame into a TelemetryEvent', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)

    ws._triggerEvent('*', {
      type: 'event',
      event: 'agent.dispatch',
      payload: {
        eventId: 'ws-agent-1',
        subsystem: 'room-agents',
        summary: 'Agent dispatched via WS',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    })

    expect(bus.emitted).toHaveLength(1)
    const emitted = bus.emitted[0].args[0] as TelemetryEvent
    expect(emitted.type).toBe('agent-dispatch')
    expect(emitted.eventId).toBe('ws-agent-1')
    expect(emitted.subsystem).toBe('room-agents')
  })

  it('ignores WS frames with unknown event names', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)

    ws._triggerEvent('*', {
      type: 'event',
      event: 'unknown.event',
      payload: {},
    })

    expect(bus.emitted).toHaveLength(0)
  })

  it('ignores WS frames with no event field', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)

    ws._triggerEvent('*', { type: 'res', id: 'x', ok: true, payload: {} })

    expect(bus.emitted).toHaveLength(0)
  })

  // ---- Synthetic gateway-offline (Req 7.5) ---------------------------------

  it('emits gateway-offline when WS status becomes disconnected', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)

    ws._triggerStatus('disconnected')

    expect(bus.emitted).toHaveLength(1)
    const event = bus.emitted[0].args[0] as TelemetryEvent
    expect(event.type).toBe('gateway-offline')
    expect(event.subsystem).toBe('room-hub')
  })

  it('emits gateway-offline when WS status becomes error', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)

    ws._triggerStatus('error')

    const event = bus.emitted[0].args[0] as TelemetryEvent
    expect(event.type).toBe('gateway-offline')
  })

  it('does not emit gateway-offline for non-disconnect statuses', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)

    ws._triggerStatus('connecting')
    ws._triggerStatus('connected')
    ws._triggerStatus('auth_failed')

    expect(bus.emitted).toHaveLength(0)
  })

  // ---- Polling attachment (Req 7.2) ----------------------------------------

  it('polls a source and emits transformed events', async () => {
    vi.useFakeTimers()

    const mockEvent: TelemetryEvent = {
      eventId: 'poll-1',
      type: 'memory-search',
      subsystem: 'room-memory',
      timestamp: new Date().toISOString(),
      summary: 'Memory search',
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })

    const source: PollingSource = {
      subsystem: 'memory',
      endpoint: '/api/memory/items',
      intervalMs: 1000,
      transform: () => [mockEvent],
    }

    pipeline.attachPolling([source])
    await vi.advanceTimersByTimeAsync(1100)

    expect(bus.emitted.length).toBeGreaterThanOrEqual(1)
    expect((bus.emitted[0].args[0] as TelemetryEvent).eventId).toBe('poll-1')

    vi.useRealTimers()
  })

  it('silently ignores polling fetch failures', async () => {
    vi.useFakeTimers()

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const source: PollingSource = {
      subsystem: 'memory',
      endpoint: '/api/memory/items',
      intervalMs: 500,
      transform: () => [],
    }

    pipeline.attachPolling([source])
    await vi.advanceTimersByTimeAsync(600)

    expect(bus.emitted).toHaveLength(0)

    vi.useRealTimers()
  })

  // ---- destroy (lifecycle) -------------------------------------------------

  it('stops polling timers on destroy', async () => {
    vi.useFakeTimers()

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const source: PollingSource = {
      subsystem: 'memory',
      endpoint: '/api/memory/items',
      intervalMs: 500,
      transform: () => [{
        eventId: 'after-destroy',
        type: 'memory-write' as const,
        subsystem: 'room-memory',
        timestamp: new Date().toISOString(),
        summary: 'Should not appear',
      }],
    }

    pipeline.attachPolling([source])
    pipeline.destroy()

    vi.advanceTimersByTime(2000)
    await vi.runAllTimersAsync()

    expect(bus.emitted).toHaveLength(0)

    vi.useRealTimers()
  })

  it('removes WS listeners on destroy', () => {
    const ws = makeWsClient()
    pipeline.attachWebSocket(ws as never)
    pipeline.destroy()

    ws._triggerStatus('disconnected')
    ws._triggerEvent('*', {
      type: 'event',
      event: 'agent.dispatch',
      payload: { eventId: 'after-destroy', subsystem: 'room-agents', summary: 'x' },
    })

    expect(bus.emitted).toHaveLength(0)
  })
})
