/**
 * Town event bus — bridges the Phaser game world with React UI.
 * Adapted from agent-town's GameEventBus for Octavius quadrant agents.
 */

import type { QuadrantId } from '@/lib/memory/models'

export interface SeatDef {
  seatId: string
  label?: string
  x: number
  y: number
  facing: 'right' | 'up' | 'left' | 'down'
  index?: number
}

export type SeatStatus = 'empty' | 'running' | 'returning' | 'done' | 'failed'

export interface TownSeatState {
  seatId: string
  label: string
  quadrant?: QuadrantId
  agentId?: string
  spriteKey?: string
  status: SeatStatus
  taskSnippet?: string
  runId?: string
}

export interface TownEventMap {
  'seats-discovered': [seats: SeatDef[]]
  'seat-configs-updated': [seats: TownSeatState[]]
  'task-assigned': [seatId: string, message: string]
  'task-bubble': [seatId: string, text: string, ttl: number]
  'task-completed': [seatId: string]
  'task-failed': [seatId: string]
  'agent-status': [seatId: string, status: SeatStatus]
  'open-terminal': [seatId?: string]
  'terminal-closed': []
}

type Listener<T extends unknown[]> = (...args: T) => void

class TownEventBus {
  private listeners = new Map<string, Set<Listener<unknown[]>>>()

  on<K extends keyof TownEventMap>(event: K, fn: Listener<TownEventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn as Listener<unknown[]>)
    return () => this.off(event, fn)
  }

  off<K extends keyof TownEventMap>(event: K, fn: Listener<TownEventMap[K]>) {
    this.listeners.get(event)?.delete(fn as Listener<unknown[]>)
  }

  emit<K extends keyof TownEventMap>(event: K, ...args: TownEventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => {
      try { fn(...args) } catch (err) { console.error(`[TownEvents] error on "${event}":`, err) }
    })
  }
}

export const townEvents = new TownEventBus()
