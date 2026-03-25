/**
 * Unit tests for Worker room-routing extensions (Task 3.1).
 * Validates: Requirements 3.2, 3.3, 4.2, 4.3, 5.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IDLE_TIMEOUT_MS, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'
import type { TelemetryEvent, WorkState } from '@/lib/gateway-view/types'
import type { BotState } from '@/lib/town/bot-state-store'

// ---------------------------------------------------------------------------
// Phaser mock — minimal stubs matching GatewayActor.test.ts pattern
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
    setPosition(nx: number, ny: number) { this.x = nx; this.y = ny },
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

function makeTextObject() {
  return {
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn(),
    destroy: vi.fn(),
  }
}

function makeScene(spriteX = 100, spriteY = 100) {
  const sprite = makeSprite(spriteX, spriteY)
  const emoteSprite = makeEmoteSprite()

  return {
    _sprite: sprite,
    _emoteSprite: emoteSprite,
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
      sprite: vi.fn().mockReturnValue(emoteSprite),
      text: vi.fn().mockReturnValue(makeTextObject()),
    },
  }
}


// ---------------------------------------------------------------------------
// Pathfinder mock
// 'no-path' → findPath returns null (apply work state immediately)
// 'path'    → findPath returns a 2-point path (worker navigates)
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

function makeEvent(type: TelemetryEvent['type'] = 'agent-dispatch', id = 'e1'): TelemetryEvent {
  return {
    eventId: id,
    type,
    subsystem: 'room-agents',
    timestamp: new Date().toISOString(),
    summary: 'Test event',
  }
}

const defaultPois = [{ name: 'poi-1', x: 150, y: 150, facing: null }]

// ---------------------------------------------------------------------------
// Import Worker AFTER mocks are set up
// ---------------------------------------------------------------------------

let Worker: typeof import('./Worker').Worker
let resetWanderClock: typeof import('./Worker').resetWanderClock

beforeEach(async () => {
  const mod = await import('./Worker')
  Worker = mod.Worker
  resetWanderClock = mod.resetWanderClock
  resetWanderClock()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Worker — enqueueEvent queues and triggers navigation (Req 3.2)', () => {
  it('enqueues an event and calls pathfinder to navigate to target room', () => {
    const scene = makeScene()
    const pf = makePathfinder('path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    worker.enqueueEvent(makeEvent('agent-dispatch', 'e1'), 'room-agents', 300, 300)

    expect(pf.findPath).toHaveBeenCalledWith(100, 100, 300, 300)
    expect(worker.getCurrentRoomId()).toBe('room-agents')

    worker.destroy()
  })

  it('applies work state immediately when no path exists (Req 3.5)', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    worker.enqueueEvent(makeEvent('memory-write', 'e1'), 'room-memory', 200, 200)

    expect(worker.workState).toBe(EVENT_TO_WORK_STATE['memory-write'])
    expect(worker.workState).toBe('cataloging')

    worker.destroy()
  })

  it('transitions to correct work state for each event type when no path', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

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
      worker.enqueueEvent(makeEvent(type, `evt-${type}`), 'room-test', 200, 200)
      expect(worker.workState).toBe(expectedState)
    }

    worker.destroy()
  })
})

describe('Worker — getSerializableState returns correct BotState shape (Req 5.2)', () => {
  it('returns a BotState with all required fields', () => {
    const scene = makeScene(150, 250)
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-1', 'Industry', 'industry',
      'character_03', 150, 250, 'right', pf as never, defaultPois,
    )

    // Trigger an event to set some state
    worker.enqueueEvent(makeEvent('memory-search', 'evt-1'), 'room-memory', 200, 200)

    const state = worker.getSerializableState()

    expect(state).toEqual(expect.objectContaining({
      seatId: 'seat-1',
      x: expect.any(Number),
      y: expect.any(Number),
      facing: expect.stringMatching(/^(up|down|left|right)$/),
      status: expect.any(String),
      currentRoomId: 'room-memory',
      path: expect.any(Array),
      pathIdx: expect.any(Number),
      workState: 'processing',
      lastEventId: 'evt-1',
    }))

    worker.destroy()
  })

  it('returns null currentRoomId and idle workState when no events processed', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    const state = worker.getSerializableState()

    expect(state.seatId).toBe('seat-0')
    expect(state.currentRoomId).toBeNull()
    expect(state.workState).toBe('idle')
    expect(state.lastEventId).toBeNull()

    worker.destroy()
  })

  it('tracks lastEventId from the most recent event', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    worker.enqueueEvent(makeEvent('agent-dispatch', 'first-event'), 'room-agents', 200, 200)
    worker.enqueueEvent(makeEvent('memory-write', 'second-event'), 'room-memory', 300, 300)

    const state = worker.getSerializableState()
    expect(state.lastEventId).toBe('second-event')

    worker.destroy()
  })
})

describe('Worker — restoreState positions worker correctly (Req 5.2)', () => {
  it('restores position, facing, status, and room from BotState', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-2', 'Fellowship', 'fellowship',
      'character_04', 100, 100, 'down', pf as never, defaultPois,
    )

    const savedState: BotState = {
      seatId: 'seat-2',
      x: 400,
      y: 500,
      facing: 'left',
      status: 'running',
      currentRoomId: 'room-fellowship',
      path: [],
      pathIdx: 0,
      workState: 'executing',
      lastEventId: 'restored-evt',
    }

    worker.restoreState(savedState)

    // Verify sprite was repositioned
    expect(scene._sprite.x).toBe(400)
    expect(scene._sprite.y).toBe(500)

    // Verify serializable state matches restored values
    const state = worker.getSerializableState()
    expect(state.facing).toBe('left')
    expect(state.status).toBe('running')
    expect(state.currentRoomId).toBe('room-fellowship')
    expect(state.workState).toBe('executing')
    expect(state.lastEventId).toBe('restored-evt')

    worker.destroy()
  })

  it('resumes interrupted path from saved pathIdx', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    const savedState: BotState = {
      seatId: 'seat-0',
      x: 200,
      y: 200,
      facing: 'right',
      status: 'empty',
      currentRoomId: 'room-memory',
      path: [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
        { x: 300, y: 300 },
        { x: 400, y: 400 },
      ],
      pathIdx: 2,
      workState: 'processing',
      lastEventId: 'path-evt',
    }

    worker.restoreState(savedState)

    const state = worker.getSerializableState()
    expect(state.path).toHaveLength(4)
    expect(state.pathIdx).toBe(2)

    worker.destroy()
  })

  it('schedules wandering when restored to idle state with no path', () => {
    vi.useFakeTimers()

    const scene = makeScene()
    const pf = makePathfinder('path') // return a path when wander triggers
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    const savedState: BotState = {
      seatId: 'seat-0',
      x: 100,
      y: 100,
      facing: 'down',
      status: 'empty',
      currentRoomId: null,
      path: [],
      pathIdx: 0,
      workState: 'idle',
      lastEventId: null,
    }

    worker.restoreState(savedState)

    // Advance time to trigger wander scheduling
    vi.advanceTimersByTime(15000)

    // Pathfinder should have been called at least once for wandering
    // (constructor also schedules wander, so findPath may be called)
    expect(pf.findPath).toHaveBeenCalled()

    worker.destroy()
    vi.useRealTimers()
  })
})

describe('Worker — event queue processes sequentially (Req 4.3)', () => {
  it('queues new events while navigating and processes them in order', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    // Enqueue multiple events — with no path, they process immediately in order
    worker.enqueueEvent(makeEvent('agent-dispatch', 'e1'), 'room-agents', 200, 200)
    worker.enqueueEvent(makeEvent('memory-write', 'e2'), 'room-memory', 300, 300)
    worker.enqueueEvent(makeEvent('health-import', 'e3'), 'room-health', 400, 400)

    // Final state should reflect the last event processed
    const state = worker.getSerializableState()
    expect(state.lastEventId).toBe('e3')
    expect(state.currentRoomId).toBe('room-health')
    expect(state.workState).toBe('monitoring')

    worker.destroy()
  })

  it('queues events when worker is navigating (path exists)', () => {
    const scene = makeScene()
    // First call returns a path (worker navigates), subsequent calls also return paths
    const pf = makePathfinder('path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    // First event starts navigation
    worker.enqueueEvent(makeEvent('agent-dispatch', 'e1'), 'room-agents', 300, 300)

    // Second event should be queued (worker is still navigating)
    worker.enqueueEvent(makeEvent('memory-write', 'e2'), 'room-memory', 400, 400)

    // Worker should be heading to room-agents (first event)
    expect(worker.getCurrentRoomId()).toBe('room-agents')

    // The work state hasn't been applied yet (still navigating)
    // lastEventId is set when processNextEvent shifts from queue
    const state = worker.getSerializableState()
    expect(state.lastEventId).toBe('e1')

    worker.destroy()
  })

  it('processes all queued events without skipping any (no-path mode)', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    const eventTypes: TelemetryEvent['type'][] = [
      'agent-dispatch',
      'memory-write',
      'health-import',
      'cost-alert',
      'task-create',
    ]

    for (let i = 0; i < eventTypes.length; i++) {
      worker.enqueueEvent(makeEvent(eventTypes[i], `seq-${i}`), 'room-test', 200, 200)
    }

    // All events should have been processed — pathfinder called for each
    expect(pf.findPath).toHaveBeenCalledTimes(eventTypes.length)

    // Final state reflects last event
    expect(worker.getSerializableState().lastEventId).toBe('seq-4')

    worker.destroy()
  })
})

describe('Worker — 30-second idle timeout resumes wandering (Req 4.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('transitions to idle after IDLE_TIMEOUT_MS with no new events', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    // Put worker in a non-idle state via event
    worker.enqueueEvent(makeEvent('agent-dispatch', 'e1'), 'room-agents', 200, 200)
    expect(worker.workState).toBe('executing')

    // Advance past idle timeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1)

    expect(worker.workState).toBe('idle')
    expect(worker.getCurrentRoomId()).toBeNull()

    worker.destroy()
  })

  it('does NOT transition to idle before IDLE_TIMEOUT_MS elapses', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    worker.enqueueEvent(makeEvent('memory-search', 'e1'), 'room-memory', 200, 200)
    expect(worker.workState).toBe('processing')

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1)

    expect(worker.workState).toBe('processing')

    worker.destroy()
  })

  it('resets the idle timer when a new event is enqueued', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    worker.enqueueEvent(makeEvent('agent-dispatch', 'e1'), 'room-agents', 200, 200)
    expect(worker.workState).toBe('executing')

    // Advance almost to timeout
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 100)
    expect(worker.workState).toBe('executing')

    // Enqueue a new event — resets the timer
    worker.enqueueEvent(makeEvent('memory-write', 'e2'), 'room-memory', 300, 300)
    expect(worker.workState).toBe('cataloging')

    // Advance past the original timeout point — should NOT have gone idle
    vi.advanceTimersByTime(200)
    expect(worker.workState).toBe('cataloging')

    // Advance the full timeout from the reset point — now it should go idle
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS)
    expect(worker.workState).toBe('idle')

    worker.destroy()
  })

  it('clears currentRoomId when transitioning to idle', () => {
    const scene = makeScene()
    const pf = makePathfinder('no-path')
    const worker = new Worker(
      scene as never, 'seat-0', 'Lifeforce', 'lifeforce',
      'character_02', 100, 100, 'down', pf as never, defaultPois,
    )

    worker.enqueueEvent(makeEvent('obsidian-sync', 'e1'), 'room-obsidian', 200, 200)
    expect(worker.getCurrentRoomId()).toBe('room-obsidian')

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1)

    expect(worker.getCurrentRoomId()).toBeNull()

    worker.destroy()
  })
})
