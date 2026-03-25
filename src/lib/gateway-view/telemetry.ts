/**
 * TelemetryPipeline — collects events from WebSocket and polling sources,
 * deduplicates them, and emits normalized TelemetryEvent objects on the
 * GatewayEventBus.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import type { WsGatewayClient, GatewayFrame } from '../town/ws-gateway'
import { gatewayEvents } from './events'
import type { GatewayEventMap } from './events'

type Listener<T extends unknown[]> = (...args: T) => void
interface GatewayEventBus {
  on<K extends keyof GatewayEventMap>(event: K, fn: Listener<GatewayEventMap[K]>): () => void
  off<K extends keyof GatewayEventMap>(event: K, fn: Listener<GatewayEventMap[K]>): void
  emit<K extends keyof GatewayEventMap>(event: K, ...args: GatewayEventMap[K]): void
}
import type { TelemetryEvent, PollingSource } from './types'
import { DEDUP_WINDOW_MS } from './constants'

// ---------------------------------------------------------------------------
// Frame → TelemetryEvent transformation helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to transform a raw WsGatewayClient event frame into a TelemetryEvent.
 * Returns null if the frame cannot be mapped to a known telemetry type.
 */
function frameToTelemetryEvent(frame: GatewayFrame): TelemetryEvent | null {
  const eventName = frame.event
  if (!eventName) return null

  const payload = frame.payload ?? {}

  // Map known gateway event names to TelemetryEventType
  const typeMap: Record<string, TelemetryEvent['type']> = {
    'agent.dispatch':       'agent-dispatch',
    'agent.complete':       'agent-complete',
    'agent.fail':           'agent-fail',
    'task.create':          'task-create',
    'task.complete':        'task-complete',
    'task.update':          'task-update',
    'memory.write':         'memory-write',
    'memory.search':        'memory-search',
    'memory.consolidation': 'memory-consolidation',
    'health.import':        'health-import',
    'health.checkin':       'health-checkin',
    'lcm.status_change':    'lcm-status-change',
    'cost.alert':           'cost-alert',
    'cost.update':          'cost-update',
    'obsidian.sync':        'obsidian-sync',
    'obsidian.push':        'obsidian-push',
    'obsidian.pull':        'obsidian-pull',
    'gateway.online':       'gateway-online',
    'gateway.offline':      'gateway-offline',
  }

  const type = typeMap[eventName]
  if (!type) return null

  const eventId =
    (payload.eventId as string | undefined) ??
    (payload.id as string | undefined) ??
    `ws-${eventName}-${Date.now()}`

  const subsystem =
    (payload.subsystem as string | undefined) ??
    deriveSubsystem(type)

  const summary =
    (payload.summary as string | undefined) ??
    (payload.message as string | undefined) ??
    `${type} event received`

  return {
    eventId,
    type,
    subsystem,
    timestamp: (payload.timestamp as string | undefined) ?? new Date().toISOString(),
    summary: summary.slice(0, 120),
    metadata: payload as Record<string, unknown>,
  }
}

/** Derive a default subsystem/roomId from the event type. */
function deriveSubsystem(type: TelemetryEvent['type']): string {
  if (type.startsWith('agent'))    return 'room-agents'
  if (type.startsWith('memory'))   return 'room-memory'
  if (type.startsWith('health'))   return 'room-health'
  if (type.startsWith('lcm'))      return 'room-lcm'
  if (type.startsWith('cost'))     return 'room-costs'
  if (type.startsWith('obsidian')) return 'room-obsidian'
  if (type.startsWith('task'))     return 'room-tasks'
  return 'room-hub'
}

// ---------------------------------------------------------------------------
// TelemetryPipeline
// ---------------------------------------------------------------------------

export class TelemetryPipeline {
  private bus: GatewayEventBus
  /** eventId → expiry timestamp (ms since epoch) */
  private seenIds: Map<string, number> = new Map()
  private cleanupFns: Array<() => void> = []
  private pollingTimers: ReturnType<typeof setInterval>[] = []

  constructor(bus: GatewayEventBus = gatewayEvents) {
    this.bus = bus
  }

  // -------------------------------------------------------------------------
  // WebSocket attachment (Req 7.2, 7.3, 7.5)
  // -------------------------------------------------------------------------

  /**
   * Attach a WsGatewayClient. Listens to all events via the wildcard listener
   * and transforms frames into TelemetryEvents. Also emits a synthetic
   * `gateway-offline` event when the WebSocket disconnects.
   */
  attachWebSocket(wsClient: WsGatewayClient): void {
    // Listen to all event frames via the '*' wildcard
    const offEvent = wsClient.on('*', (raw: unknown) => {
      const frame = raw as GatewayFrame
      const event = frameToTelemetryEvent(frame)
      if (event) this.emit(event)
    })

    // Emit synthetic gateway-offline when status transitions to disconnected/error
    const offStatus = wsClient.onStatus((status) => {
      if (status === 'disconnected' || status === 'error') {
        this.emit({
          eventId: `gateway-offline-${Date.now()}`,
          type: 'gateway-offline',
          subsystem: 'room-hub',
          timestamp: new Date().toISOString(),
          summary: `Gateway WebSocket ${status}`,
        })
      }
    })

    this.cleanupFns.push(offEvent, offStatus)
  }

  // -------------------------------------------------------------------------
  // Polling attachment (Req 7.2)
  // -------------------------------------------------------------------------

  /**
   * Attach one or more polling sources. Each source is polled at its configured
   * interval; the transform function converts the raw API response into
   * TelemetryEvents.
   */
  attachPolling(sources: PollingSource[]): void {
    for (const source of sources) {
      const timer = setInterval(async () => {
        try {
          const res = await fetch(source.endpoint)
          if (!res.ok) return
          const data: unknown = await res.json()
          const events = source.transform(data)
          for (const event of events) this.emit(event)
        } catch {
          // Polling failures are silent — the pipeline degrades gracefully
        }
      }, source.intervalMs)

      this.pollingTimers.push(timer)
    }
  }

  // -------------------------------------------------------------------------
  // Emit with deduplication (Req 7.1, 7.4)
  // -------------------------------------------------------------------------

  /**
   * Deduplicate by eventId within a DEDUP_WINDOW_MS sliding window, then
   * forward to the GatewayEventBus.
   */
  emit(event: TelemetryEvent): void {
    const now = Date.now()

    // Purge expired entries from the dedup window
    for (const [id, expiry] of this.seenIds) {
      if (expiry <= now) this.seenIds.delete(id)
    }

    if (this.seenIds.has(event.eventId)) return

    this.seenIds.set(event.eventId, now + DEDUP_WINDOW_MS)
    this.bus.emit('telemetry-event', event)
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  destroy(): void {
    for (const fn of this.cleanupFns) fn()
    this.cleanupFns = []

    for (const timer of this.pollingTimers) clearInterval(timer)
    this.pollingTimers = []

    this.seenIds.clear()
  }
}
