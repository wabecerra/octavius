/**
 * Unit tests for BotStateStore
 * Validates: Requirements 5.1, 5.4, 5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BotStateStore } from './bot-state-store'
import type { BotState } from './bot-state-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'octavius-bot-state'

function makeBotState(overrides: Partial<BotState> = {}): BotState {
  return {
    seatId: 'seat-0',
    x: 100,
    y: 200,
    facing: 'down',
    status: 'empty',
    currentRoomId: null,
    path: [],
    pathIdx: 0,
    workState: 'idle',
    lastEventId: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BotStateStore', () => {
  let store: BotStateStore

  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    store = new BotStateStore()
  })

  afterEach(() => {
    store.clear()
    vi.useRealTimers()
  })

  // ---- save/load round-trip (Req 5.1, 5.5) --------------------------------

  it('round-trips BotState[] through save then load', () => {
    const states: BotState[] = [
      makeBotState({ seatId: 'seat-0', x: 10, y: 20, facing: 'right', status: 'running', currentRoomId: 'room-memory' }),
      makeBotState({ seatId: 'seat-1', x: 50, y: 60, facing: 'up', workState: 'processing', lastEventId: 'evt-42' }),
    ]

    store.save(states)
    vi.advanceTimersByTime(500) // flush debounce

    const loaded = store.load()
    expect(loaded).toEqual(states)
  })

  it('persists path and pathIdx correctly', () => {
    const states: BotState[] = [
      makeBotState({
        seatId: 'seat-2',
        path: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
        pathIdx: 1,
        currentRoomId: 'room-hub',
      }),
    ]

    store.save(states)
    vi.advanceTimersByTime(500)

    const loaded = store.load()
    expect(loaded[0].path).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }])
    expect(loaded[0].pathIdx).toBe(1)
  })

  // ---- Debounce behavior (Req 5.1) ----------------------------------------

  it('debounces multiple rapid saves into a single sessionStorage write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    store.save([makeBotState({ x: 1 })])
    store.save([makeBotState({ x: 2 })])
    store.save([makeBotState({ x: 3 })])

    // Before debounce fires, no writes
    expect(spy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)

    // Only one write with the last value
    expect(spy).toHaveBeenCalledTimes(1)
    const written = JSON.parse(spy.mock.calls[0][1] as string)
    expect(written[0].x).toBe(3)

    spy.mockRestore()
  })

  it('does not write to sessionStorage before debounce period elapses', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    store.save([makeBotState()])
    vi.advanceTimersByTime(499)

    expect(spy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(spy).toHaveBeenCalledTimes(1)

    spy.mockRestore()
  })

  // ---- load returns empty array when no persisted state (Req 5.4) ----------

  it('returns empty array when sessionStorage has no persisted state', () => {
    const loaded = store.load()
    expect(loaded).toEqual([])
  })

  it('returns empty array when sessionStorage contains invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, '{not valid json')
    const loaded = store.load()
    expect(loaded).toEqual([])
  })

  // ---- clear removes the key (Req 5.5) ------------------------------------

  it('clear() removes the key from sessionStorage', () => {
    store.save([makeBotState()])
    vi.advanceTimersByTime(500)

    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull()

    store.clear()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clear() cancels a pending debounced save', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    store.save([makeBotState()])
    store.clear() // cancel before debounce fires

    vi.advanceTimersByTime(500)

    expect(spy).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()

    spy.mockRestore()
  })
})
