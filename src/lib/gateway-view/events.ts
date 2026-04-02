/**
 * Gateway event bus — bridges the Phaser GatewayScene with React UI.
 * Follows the same typed-event-map pattern as TownEventBus.
 */

import type { TelemetryEvent, WorkState } from './types'

export interface GatewayEventMap {
  'telemetry-event': [event: TelemetryEvent]
  'room-clicked': [roomId: string]
  'room-context-menu': [roomId: string, worldX: number, worldY: number]
  'room-modal-open': [roomId: string]
  'room-modal-close': []
  'actor-arrived': [roomId: string, workState: WorkState]
  'actor-state-changed': [workState: WorkState]
  'gateway-scene-ready': []
  'gateway-scene-error': [error: string]
}

type Listener<T extends unknown[]> = (...args: T) => void

export class GatewayEventBus {
  private listeners = new Map<string, Set<Listener<unknown[]>>>()

  on<K extends keyof GatewayEventMap>(event: K, fn: Listener<GatewayEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn as Listener<unknown[]>)
    return () => this.off(event, fn)
  }

  off<K extends keyof GatewayEventMap>(event: K, fn: Listener<GatewayEventMap[K]>) {
    this.listeners.get(event)?.delete(fn as Listener<unknown[]>)
  }

  emit<K extends keyof GatewayEventMap>(event: K, ...args: GatewayEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => {
      try { fn(...args) } catch (err) { console.error(`[GatewayEvents] error on "${event}":`, err) }
    })
  }
}

export const gatewayEvents = new GatewayEventBus()
