/**
 * Integration tests for NerveScene event compatibility (Task 9.2).
 *
 * These are lightweight event bus integration tests that verify the event
 * contracts NerveScene relies on — NOT full Phaser scene tests.
 * We test that the townEvents bus correctly propagates events with the
 * expected signatures (seats-discovered, task-assigned, task-completed,
 * task-failed, open-terminal).
 *
 * Validates: Requirements 8.3, 4.4
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { townEvents } from '@/lib/town/events'
import type { SeatDef, SeatStatus } from '@/lib/town/events'

describe('NerveScene event compatibility', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    cleanups.forEach(fn => fn())
    cleanups.length = 0
  })

  // ---- seats-discovered (Req 8.3) -----------------------------------------

  it('seats-discovered event carries SeatDef array', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('seats-discovered', listener))

    const seats: SeatDef[] = [
      { seatId: 'seat-0', x: 100, y: 200, facing: 'down', index: 0 },
      { seatId: 'seat-1', x: 300, y: 200, facing: 'down', index: 1 },
      { seatId: 'seat-2', x: 500, y: 200, facing: 'down', index: 2 },
      { seatId: 'seat-3', x: 700, y: 200, facing: 'down', index: 3 },
    ]

    townEvents.emit('seats-discovered', seats)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(seats)
    expect(listener.mock.calls[0][0]).toHaveLength(4)
    expect(listener.mock.calls[0][0][0]).toMatchObject({
      seatId: 'seat-0',
      x: expect.any(Number),
      y: expect.any(Number),
      facing: expect.stringMatching(/^(right|up|left|down)$/),
    })
  })

  it('seats-discovered supports optional label and index fields', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('seats-discovered', listener))

    const seats: SeatDef[] = [
      { seatId: 'seat-0', label: 'Lifeforce', x: 100, y: 200, facing: 'down', index: 0 },
    ]

    townEvents.emit('seats-discovered', seats)

    expect(listener).toHaveBeenCalledWith(seats)
    expect(listener.mock.calls[0][0][0].label).toBe('Lifeforce')
    expect(listener.mock.calls[0][0][0].index).toBe(0)
  })

  // ---- task-assigned (Req 8.3) --------------------------------------------

  it('task-assigned event carries seatId and message', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('task-assigned', listener))

    townEvents.emit('task-assigned', 'seat-0', 'Summarize daily health data')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('seat-0', 'Summarize daily health data')
  })

  it('task-assigned triggers worker.setStatus("running") pattern', () => {
    // Simulates the NerveScene wiring: on task-assigned → worker.setStatus('running')
    const setStatus = vi.fn()
    const workers = [
      { seatId: 'seat-0', setStatus },
      { seatId: 'seat-1', setStatus: vi.fn() },
    ]

    cleanups.push(
      townEvents.on('task-assigned', (seatId, message) => {
        const w = workers.find(w => w.seatId === seatId)
        if (w) w.setStatus('running', message)
      }),
    )

    townEvents.emit('task-assigned', 'seat-0', 'Process memory consolidation')

    expect(setStatus).toHaveBeenCalledWith('running', 'Process memory consolidation')
    expect(workers[1].setStatus).not.toHaveBeenCalled()
  })

  // ---- task-completed (Req 8.3) -------------------------------------------

  it('task-completed event carries seatId', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('task-completed', listener))

    townEvents.emit('task-completed', 'seat-2')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('seat-2')
  })

  it('task-completed triggers worker.setStatus("done") pattern', () => {
    const setStatus = vi.fn()
    const workers = [
      { seatId: 'seat-0', setStatus: vi.fn() },
      { seatId: 'seat-1', setStatus },
    ]

    cleanups.push(
      townEvents.on('task-completed', (seatId) => {
        const w = workers.find(w => w.seatId === seatId)
        if (w) w.setStatus('done')
      }),
    )

    townEvents.emit('task-completed', 'seat-1')

    expect(setStatus).toHaveBeenCalledWith('done')
    expect(workers[0].setStatus).not.toHaveBeenCalled()
  })

  // ---- task-failed (Req 8.3) ----------------------------------------------

  it('task-failed event carries seatId', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('task-failed', listener))

    townEvents.emit('task-failed', 'seat-3')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('seat-3')
  })

  it('task-failed triggers worker.setStatus("failed") pattern', () => {
    const setStatus = vi.fn()
    const workers = [{ seatId: 'seat-3', setStatus }]

    cleanups.push(
      townEvents.on('task-failed', (seatId) => {
        const w = workers.find(w => w.seatId === seatId)
        if (w) w.setStatus('failed')
      }),
    )

    townEvents.emit('task-failed', 'seat-3')

    expect(setStatus).toHaveBeenCalledWith('failed')
  })

  // ---- open-terminal (Req 4.4) --------------------------------------------

  it('open-terminal event carries optional seatId', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('open-terminal', listener))

    townEvents.emit('open-terminal', 'seat-1')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('seat-1')
  })

  it('open-terminal event works without seatId argument', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('open-terminal', listener))

    townEvents.emit('open-terminal')

    expect(listener).toHaveBeenCalledOnce()
    // When emitted without args, listener is called with no arguments (empty call)
    expect(listener.mock.calls[0]).toHaveLength(0)
  })

  // ---- Cleanup verification -----------------------------------------------

  it('unsubscribe function removes listener', () => {
    const listener = vi.fn()
    const unsub = townEvents.on('task-assigned', listener)

    townEvents.emit('task-assigned', 'seat-0', 'test')
    expect(listener).toHaveBeenCalledOnce()

    unsub()

    townEvents.emit('task-assigned', 'seat-0', 'should not receive')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('multiple listeners on the same event all receive the emission', () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    cleanups.push(townEvents.on('task-completed', listener1))
    cleanups.push(townEvents.on('task-completed', listener2))

    townEvents.emit('task-completed', 'seat-0')

    expect(listener1).toHaveBeenCalledWith('seat-0')
    expect(listener2).toHaveBeenCalledWith('seat-0')
  })

  // ---- agent-status (Req 8.3) ---------------------------------------------

  it('agent-status event carries seatId and status', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('agent-status', listener))

    const status: SeatStatus = 'running'
    townEvents.emit('agent-status', 'seat-2', status)

    expect(listener).toHaveBeenCalledWith('seat-2', 'running')
  })

  // ---- terminal-closed (Req 8.3) ------------------------------------------

  it('terminal-closed event fires with no arguments', () => {
    const listener = vi.fn()
    cleanups.push(townEvents.on('terminal-closed', listener))

    townEvents.emit('terminal-closed')

    expect(listener).toHaveBeenCalledOnce()
  })
})
