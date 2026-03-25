// ---------------------------------------------------------------------------
// Integration tests for Gateway View data flow
// Task 12: Sub-tasks 12.1, 12.2, 12.3
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { EVENT_TO_ROOM, EVENT_TO_WORK_STATE } from './constants'
import { gatewayEvents, GatewayEventBus } from './events'
import type { TelemetryEventType, WorkState, RoomManifest, TelemetryEvent } from './types'

// ---- Helpers ---------------------------------------------------------------

/** All valid TelemetryEventType values, derived from the union type via the mapping keys */
const ALL_EVENT_TYPES = Object.keys(EVENT_TO_ROOM) as TelemetryEventType[]

/** All valid WorkState values */
const ALL_WORK_STATES: WorkState[] = [
  'idle', 'processing', 'monitoring', 'writing',
  'cataloging', 'executing', 'error', 'resting',
]

// ---------------------------------------------------------------------------
// 12.1 — Property 2: EVENT_TO_ROOM maps to valid roomIds in the RoomManifest
// Validates: Requirements 2.3, 9.1–9.8
// ---------------------------------------------------------------------------

describe('Property 2: EVENT_TO_ROOM → valid RoomManifest roomIds', () => {
  const manifestPath = resolve(__dirname, '../../..', 'public/town/gateway/gateway-map.logic.json')
  const manifestJson = readFileSync(manifestPath, 'utf-8')
  const manifest: RoomManifest = JSON.parse(manifestJson)
  const validRoomIds = new Set(manifest.rooms.map((r) => r.roomId))

  /**
   * **Validates: Requirements 2.3, 9.1–9.8**
   *
   * Property 2: For all valid TelemetryEventType values,
   * `EVENT_TO_ROOM[type]` maps to a roomId that exists in the RoomManifest.
   */
  it('every EVENT_TO_ROOM value is a valid roomId in the manifest', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_EVENT_TYPES),
        (eventType) => {
          const roomId = EVENT_TO_ROOM[eventType]
          expect(roomId).toBeDefined()
          expect(validRoomIds.has(roomId)).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('EVENT_TO_ROOM covers every TelemetryEventType', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      expect(EVENT_TO_ROOM).toHaveProperty(eventType)
    }
  })
})

// ---------------------------------------------------------------------------
// 12.2 — Property 3: EVENT_TO_WORK_STATE maps to valid WorkState values
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe('Property 3: EVENT_TO_WORK_STATE → valid WorkState', () => {
  const workStateSet = new Set<string>(ALL_WORK_STATES)

  /**
   * **Validates: Requirements 3.4**
   *
   * Property 3: For all valid TelemetryEventType values,
   * `EVENT_TO_WORK_STATE[type]` maps to a valid WorkState value.
   */
  it('every EVENT_TO_WORK_STATE value is a valid WorkState', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_EVENT_TYPES),
        (eventType) => {
          const workState = EVENT_TO_WORK_STATE[eventType]
          expect(workState).toBeDefined()
          expect(workStateSet.has(workState)).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('EVENT_TO_WORK_STATE covers every TelemetryEventType', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      expect(EVENT_TO_WORK_STATE).toHaveProperty(eventType)
    }
  })
})

// ---------------------------------------------------------------------------
// 12.3 — Unit tests for GatewayEventBus
// Validates: Requirements 7.1, 7.2
// ---------------------------------------------------------------------------

describe('GatewayEventBus', () => {
  let bus: GatewayEventBus

  beforeEach(() => {
    bus = new GatewayEventBus()
  })

  it('on/emit: listener receives emitted event args', () => {
    const received: string[] = []
    bus.on('room-clicked', (roomId) => received.push(roomId))

    bus.emit('room-clicked', 'room-memory')
    bus.emit('room-clicked', 'room-agents')

    expect(received).toEqual(['room-memory', 'room-agents'])
  })

  it('on/emit: multiple listeners on the same event all fire', () => {
    const a: string[] = []
    const b: string[] = []
    bus.on('room-clicked', (id) => a.push(id))
    bus.on('room-clicked', (id) => b.push(id))

    bus.emit('room-clicked', 'room-hub')

    expect(a).toEqual(['room-hub'])
    expect(b).toEqual(['room-hub'])
  })

  it('off: removes a specific listener', () => {
    const received: string[] = []
    const listener = (roomId: string) => received.push(roomId)

    bus.on('room-clicked', listener)
    bus.emit('room-clicked', 'room-memory')
    expect(received).toHaveLength(1)

    bus.off('room-clicked', listener)
    bus.emit('room-clicked', 'room-agents')
    expect(received).toHaveLength(1) // no new entry
  })

  it('on returns an unsubscribe function that removes the listener', () => {
    const received: string[] = []
    const unsub = bus.on('room-clicked', (id) => received.push(id))

    bus.emit('room-clicked', 'room-tasks')
    expect(received).toHaveLength(1)

    unsub()
    bus.emit('room-clicked', 'room-health')
    expect(received).toHaveLength(1) // still 1
  })

  it('error isolation: a throwing listener does not prevent other listeners from firing', () => {
    const received: string[] = []
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    bus.on('room-clicked', () => { throw new Error('boom') })
    bus.on('room-clicked', (id) => received.push(id))

    bus.emit('room-clicked', 'room-lcm')

    expect(received).toEqual(['room-lcm'])
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('emit with no listeners does not throw', () => {
    expect(() => bus.emit('room-clicked', 'room-costs')).not.toThrow()
  })

  it('handles telemetry-event with full TelemetryEvent payload', () => {
    const events: TelemetryEvent[] = []
    bus.on('telemetry-event', (ev) => events.push(ev))

    const te: TelemetryEvent = {
      eventId: 'test-1',
      type: 'agent-dispatch',
      subsystem: 'room-agents',
      timestamp: new Date().toISOString(),
      summary: 'Agent dispatched',
    }
    bus.emit('telemetry-event', te)

    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe('test-1')
  })

  it('handles events with no args (room-modal-close)', () => {
    let called = false
    bus.on('room-modal-close', () => { called = true })
    bus.emit('room-modal-close')
    expect(called).toBe(true)
  })
})
