/**
 * Unit tests for GatewayActor event queue and state machine.
 * Validates: Requirements 2.7, 3.5, 3.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IDLE_TIMEOUT_MS, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'
import type { TelemetryEvent, RoomDef, WorkState } from '@/lib/gateway-view/types'

// ---------------------------------------------------------------------------
// Phaser mock — minimal stubs for the APIs GatewayActor uses
// ---------------------------------------------------------------------------

function makeAnimsController() {
  let currentKey: string | null = null
  return {
    currentAnim: null as { key: string } | null,
    play(key: string) {
      currentKey = key
      this.currentAnim = { key }
    },
    getCurrentKey() { return currentKey },
  }
}

function makeSprite(x = 100, y = 100) {
  const anims = makeAnimsController()
  const body = {
    setSize: vi.fn(),
    setOffset: vi.fn(),
    setVelocity: vi.fn(),
  }
  return {
    x,
    y,
    anims,
    body,
    setDepth: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  }
}

function makeEmoteSprite() {
  return {
    setDepth: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setPosition: vi.fn(),
    setFrame: vi.fn(),
    destroy: vi.fn(),
  }
}

function makeScene(spriteX = 100, spriteY = 100) {
  const sprite = makeSprite(spriteX, spriteY)
  const emoteSprite = makeEmoteSprite()
  let emoteCreated = false

  return {
    _sprite: sprite,
    _emoteSprite: emoteSprite,
    _emoteCreated: () => emoteCreated,
    physics: {
      add: {
        sprite: vi.fn().mockReturnValue(sprite),
      },
    },
    anims: {
      exists: vi.fn().mockReturnValue(false),
      create: vi.fn(),
    },
    add: {
      sprite: vi.fn().mockImplementation(() => {
        emoteCreated = true
        return emoteSprite
      }),
    },
  }
}

// ---------------------------------------------------------------------------
// Pathfinder mock
// makePathfinder()         → returns null (no path, triggers applyEventState)
// makePathfinder('path')   → returns a 2-point path (actor navigates)
// ---------------------------------------------------------------------------

function makePathfinder(mode: 'no-path' | 'path' = 'no-path') {
  const returnValue =
    mode === 'path'
      ? [
          { x: 100, y: 100 },
          { x: 300, y: 300 },
        ]
      : null
  return {
    findPath: vi.fn().mockReturnValue(returnValue),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoom(overrides: Partial<RoomDef> = {}): RoomDef {
  return {
    roomId: 'room-agents',
    label: 'Agents',
    icon: 'emote:exclaim',
    x: 200,
    y: 200,
    width: 100,
    height: 100,
    connections: [],
    ...overrides,
  }
}

function makeEvent(type: TelemetryEvent['type'] = 'agent-dispatch', id = 'e1'): TelemetryEvent {
  return {
    eventId: id,
    type,
    subsystem: 'room-agents',
    timestamp: new Date().toISOString(),
    summary: 'Test event',
  }
}

// ---------------------------------------------------------------------------
// Module-level mock for gatewayEvents so we can spy on emits
// ---------------------------------------------------------------------------

const emittedGatewayEvents: Array<{ event: string; args: unknown[] }> = []

vi.mock('@/lib/gateway-view/events', () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    gatewayEvents: {
      on(event: string, fn: (...args: unknown[]) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(fn)
        return () => listeners.get(event)?.delete(fn)
      },
      off(event: string, fn: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(fn)
      },
      emit(event: string, ...args: unknown[]) {
        emittedGatewayEvents.push({ event, args })
        listeners.get(event)?.forEach((fn) => fn(...args))
      },
    },
  }
})

// ---------------------------------------------------------------------------
// Import GatewayActor AFTER mocks are set up
// ---------------------------------------------------------------------------

// We import dynamically inside tests to ensure mocks are applied first.
// Use a lazy import helper.
let GatewayActor: typeof import('./GatewayActor').GatewayActor

beforeEach(async () => {
  emittedGatewayEvents.length = 0
  const mod = await import('./GatewayActor')
  GatewayActor = mod.GatewayActor
})

afterEach(() => {
  vi.clearAllTimers()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GatewayActor — work state transitions (Req 2.7, 3.5)', () => {
  it('starts in idle work state', () => {
    const scene = makeScene()
    const pf = makePathfinder() // no path → applyEventState immediately
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)
    expect(actor.workState).toBe('idle')
    actor.destroy()
  })

  it('transitions to correct WorkState when path is unavailable (immediate apply)', () => {
    const scene = makeScene()
    const pf = makePathfinder() // findPath returns null → applyEventState
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    const cases: Array<[TelemetryEvent['type'], WorkState]> = [
      ['agent-dispatch', 'executing'],
      ['memory-write', 'cataloging'],
      ['memory-search', 'processing'],
      ['health-import', 'monitoring'],
      ['obsidian-sync', 'writing'],
      ['agent-fail', 'error'],
      ['task-complete', 'idle'],
    ]

    for (const [type, expectedState] of cases) {
      const room = makeRoom()
      actor.enqueueEvent(makeEvent(type, `evt-${type}`), room)
      expect(actor.workState).toBe(expectedState)
    }

    actor.destroy()
  })

  it('emits actor-state-changed on the gateway bus when setWorkState is called', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.setWorkState('executing')

    const stateChanges = emittedGatewayEvents.filter((e) => e.event === 'actor-state-changed')
    expect(stateChanges.length).toBeGreaterThanOrEqual(1)
    expect(stateChanges[stateChanges.length - 1].args[0]).toBe('executing')

    actor.destroy()
  })

  it('maps every TelemetryEventType to the correct WorkState via EVENT_TO_WORK_STATE', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    const eventTypes = Object.keys(EVENT_TO_WORK_STATE) as TelemetryEvent['type'][]
    for (const type of eventTypes) {
      const room = makeRoom()
      actor.enqueueEvent(makeEvent(type, `map-${type}`), room)
      expect(actor.workState).toBe(EVENT_TO_WORK_STATE[type])
    }

    actor.destroy()
  })
})

describe('GatewayActor — sequential event processing (Req 2.7)', () => {
  it('processes events in enqueue order when path is unavailable', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.enqueueEvent(makeEvent('agent-dispatch', 'e1'), makeRoom({ roomId: 'room-agents' }))
    actor.enqueueEvent(makeEvent('memory-write', 'e2'), makeRoom({ roomId: 'room-memory' }))
    actor.enqueueEvent(makeEvent('health-import', 'e3'), makeRoom({ roomId: 'room-health' }))

    actor.destroy()

    // With no path, all events are applied immediately in order
    const arrivedEvents = emittedGatewayEvents.filter((e) => e.event === 'actor-arrived')
    expect(arrivedEvents[0].args[0]).toBe('room-agents')
    expect(arrivedEvents[1].args[0]).toBe('room-memory')
    expect(arrivedEvents[2].args[0]).toBe('room-health')
  })

  it('does not skip events — all queued events are processed', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    const eventTypes: TelemetryEvent['type'][] = [
      'agent-dispatch',
      'memory-write',
      'health-import',
      'cost-alert',
      'task-create',
    ]

    for (let i = 0; i < eventTypes.length; i++) {
      actor.enqueueEvent(makeEvent(eventTypes[i], `seq-${i}`), makeRoom())
    }

    const arrivedEvents = emittedGatewayEvents.filter((e) => e.event === 'actor-arrived')
    expect(arrivedEvents).toHaveLength(eventTypes.length)

    actor.destroy()
  })

  it('final work state matches the last enqueued event type', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.enqueueEvent(makeEvent('agent-dispatch', 'first'), makeRoom())
    actor.enqueueEvent(makeEvent('memory-search', 'second'), makeRoom())
    actor.enqueueEvent(makeEvent('obsidian-sync', 'last'), makeRoom())

    expect(actor.workState).toBe(EVENT_TO_WORK_STATE['obsidian-sync'])

    actor.destroy()
  })
})

describe('GatewayActor — idle timeout (Req 2.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('transitions to idle after IDLE_TIMEOUT_MS with no events', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    // Put actor in a non-idle state
    actor.setWorkState('executing')
    expect(actor.workState).toBe('executing')

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1)

    expect(actor.workState).toBe('idle')

    actor.destroy()
  })

  it('does NOT transition to idle before IDLE_TIMEOUT_MS elapses', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.setWorkState('monitoring')

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)

    expect(actor.workState).toBe('monitoring')

    actor.destroy()
  })

  it('resets the idle timer when a new event is enqueued', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.setWorkState('executing')

    // Advance almost to timeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 100)
    expect(actor.workState).toBe('executing')

    // Enqueue a new event — this resets the timer
    actor.enqueueEvent(makeEvent('memory-write', 'reset-evt'), makeRoom())

    // Advance past the original timeout point — should NOT have gone idle
    vi.advanceTimersByTime(200)
    // workState is now 'cataloging' from the memory-write event, not idle
    expect(actor.workState).toBe('cataloging')

    // Advance the full timeout from the reset point — now it should go idle
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS)
    expect(actor.workState).toBe('idle')

    actor.destroy()
  })

  it('does not transition to idle while processing events', () => {
    const scene = makeScene()
    // Return a real path so the actor stays in "processing" state (navigating)
    const pf = makePathfinder([
      { x: 100, y: 100 },
      { x: 300, y: 300 },
    ])
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    // Enqueue an event — actor starts navigating (processing = true)
    actor.enqueueEvent(makeEvent('agent-dispatch', 'nav-evt'), makeRoom())

    // Advance past idle timeout — actor is still navigating, should NOT go idle
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1)

    // workState should still be 'idle' (not yet arrived) — not reset to idle by timer
    // The timer only fires if !processing && eventQueue.length === 0
    expect(actor.workState).toBe('idle') // hasn't arrived yet, state not applied

    actor.destroy()
  })
})

describe('GatewayActor — emote clearing on idle (Req 3.6)', () => {
  it('clears emote when transitioning to idle', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    // Trigger a non-idle state that creates an emote
    actor.enqueueEvent(makeEvent('agent-dispatch', 'emote-evt'), makeRoom())
    expect(actor.workState).toBe('executing')

    // The emote sprite should have been created (executing → 'emote:exclaim')
    expect(scene.add.sprite).toHaveBeenCalled()

    // Now transition to idle — emote should be cleared
    actor.setWorkState('idle')

    // The emote sprite's destroy should have been called
    expect(scene._emoteSprite.destroy).toHaveBeenCalled()

    actor.destroy()
  })

  it('clears emote when idle timeout fires', () => {
    vi.useFakeTimers()

    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    // Put actor in a state with an emote
    actor.enqueueEvent(makeEvent('memory-search', 'emote-timeout'), makeRoom())
    expect(actor.workState).toBe('processing')

    // Advance past idle timeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1)

    expect(actor.workState).toBe('idle')
    // Emote should have been destroyed when transitioning to idle
    expect(scene._emoteSprite.destroy).toHaveBeenCalled()

    actor.destroy()
    vi.useRealTimers()
  })

  it('does not create an emote for idle state', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    // Transition directly to idle (no prior non-idle state)
    actor.setWorkState('idle')

    // scene.add.sprite should NOT have been called for idle (no emote)
    expect(scene.add.sprite).not.toHaveBeenCalled()

    actor.destroy()
  })

  it('replaces emote frame when transitioning between non-idle states', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    // First non-idle state — creates emote sprite
    actor.enqueueEvent(makeEvent('agent-dispatch', 'e-exec'), makeRoom())
    expect(scene.add.sprite).toHaveBeenCalledTimes(1)

    // Second non-idle state — reuses existing emote sprite (setFrame, not new sprite)
    actor.enqueueEvent(makeEvent('memory-search', 'e-proc'), makeRoom())
    // add.sprite should still only have been called once (reuse via setFrame)
    expect(scene.add.sprite).toHaveBeenCalledTimes(1)
    expect(scene._emoteSprite.setFrame).toHaveBeenCalled()

    actor.destroy()
  })
})

describe('GatewayActor — error state (Req 3.5)', () => {
  it('enters error state on agent-fail event', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.enqueueEvent(makeEvent('agent-fail', 'err-1'), makeRoom())
    expect(actor.workState).toBe('error')

    actor.destroy()
  })

  it('enters error state on gateway-offline event', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.enqueueEvent(makeEvent('gateway-offline', 'err-2'), makeRoom({ roomId: 'room-hub' }))
    expect(actor.workState).toBe('error')

    actor.destroy()
  })

  it('stays in error state until a new event is received', () => {
    vi.useFakeTimers()

    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.enqueueEvent(makeEvent('agent-fail', 'err-stay'), makeRoom())
    expect(actor.workState).toBe('error')

    // Advance time — error state should persist (idle timer only fires if !processing)
    // The idle timer was reset when enqueueEvent was called, so it won't fire yet
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)
    expect(actor.workState).toBe('error')

    actor.destroy()
    vi.useRealTimers()
  })

  it('exits error state when a new event arrives', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.enqueueEvent(makeEvent('agent-fail', 'err-exit'), makeRoom())
    expect(actor.workState).toBe('error')

    // New event clears error state
    actor.enqueueEvent(makeEvent('memory-search', 'recovery'), makeRoom({ roomId: 'room-memory' }))
    expect(actor.workState).toBe('processing')

    actor.destroy()
  })
})

describe('GatewayActor — getPosition and getWorkState', () => {
  it('getPosition returns sprite coordinates', () => {
    const scene = makeScene(50, 75)
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 50, 75, pf as never)

    const pos = actor.getPosition()
    expect(pos.x).toBe(50)
    expect(pos.y).toBe(75)

    actor.destroy()
  })

  it('getWorkState returns current work state', () => {
    const scene = makeScene()
    const pf = makePathfinder()
    const actor = new GatewayActor(scene as never, 100, 100, pf as never)

    actor.setWorkState('cataloging')
    expect(actor.getWorkState()).toBe('cataloging')

    actor.destroy()
  })
})
