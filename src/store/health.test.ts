import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState, latestCheckIn } from './index'
import type { WellnessCheckIn } from '@/types'

describe('Health slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('addCheckIn', () => {
    it('appends a check-in to health.checkIns', () => {
      const checkIn: WellnessCheckIn = {
        id: 'c1',
        timestamp: '2025-01-15T10:00:00Z',
        mood: 4,
        energy: 3,
        stress: 2,
      }
      useOctaviusStore.getState().addCheckIn(checkIn)
      const state = useOctaviusStore.getState()
      expect(state.health.checkIns).toHaveLength(1)
      expect(state.health.checkIns[0]).toEqual(checkIn)
    })

    it('preserves existing check-ins when adding a new one', () => {
      const first: WellnessCheckIn = {
        id: 'c1',
        timestamp: '2025-01-15T10:00:00Z',
        mood: 3,
        energy: 3,
        stress: 3,
      }
      const second: WellnessCheckIn = {
        id: 'c2',
        timestamp: '2025-01-16T10:00:00Z',
        mood: 5,
        energy: 4,
        stress: 1,
      }
      useOctaviusStore.getState().addCheckIn(first)
      useOctaviusStore.getState().addCheckIn(second)
      const state = useOctaviusStore.getState()
      expect(state.health.checkIns).toHaveLength(2)
      expect(state.health.checkIns[0]).toEqual(first)
      expect(state.health.checkIns[1]).toEqual(second)
    })

    it('does not mutate existing metrics when adding a check-in', () => {
      useOctaviusStore.getState().updateMetrics({ steps: 8000 })
      const checkIn: WellnessCheckIn = {
        id: 'c1',
        timestamp: '2025-01-15T10:00:00Z',
        mood: 4,
        energy: 4,
        stress: 2,
      }
      useOctaviusStore.getState().addCheckIn(checkIn)
      expect(useOctaviusStore.getState().health.metrics).toEqual({ steps: 8000 })
    })
  })

  describe('updateMetrics', () => {
    it('sets a single metric field', () => {
      useOctaviusStore.getState().updateMetrics({ steps: 10000 })
      expect(useOctaviusStore.getState().health.metrics).toEqual({ steps: 10000 })
    })

    it('merges multiple metric fields', () => {
      useOctaviusStore.getState().updateMetrics({ steps: 10000, sleepHours: 7 })
      expect(useOctaviusStore.getState().health.metrics).toEqual({ steps: 10000, sleepHours: 7 })
    })

    it('partially updates without overwriting existing fields', () => {
      useOctaviusStore.getState().updateMetrics({ steps: 10000 })
      useOctaviusStore.getState().updateMetrics({ heartRate: 72 })
      expect(useOctaviusStore.getState().health.metrics).toEqual({ steps: 10000, heartRate: 72 })
    })

    it('overwrites a previously set field', () => {
      useOctaviusStore.getState().updateMetrics({ sleepHours: 6 })
      useOctaviusStore.getState().updateMetrics({ sleepHours: 8 })
      expect(useOctaviusStore.getState().health.metrics.sleepHours).toBe(8)
    })

    it('does not mutate existing check-ins when updating metrics', () => {
      const checkIn: WellnessCheckIn = {
        id: 'c1',
        timestamp: '2025-01-15T10:00:00Z',
        mood: 3,
        energy: 3,
        stress: 3,
      }
      useOctaviusStore.getState().addCheckIn(checkIn)
      useOctaviusStore.getState().updateMetrics({ steps: 5000 })
      expect(useOctaviusStore.getState().health.checkIns).toHaveLength(1)
      expect(useOctaviusStore.getState().health.checkIns[0]).toEqual(checkIn)
    })
  })

  describe('latestCheckIn selector', () => {
    it('returns undefined when there are no check-ins', () => {
      const state = useOctaviusStore.getState()
      expect(latestCheckIn(state)).toBeUndefined()
    })

    it('returns the only check-in when there is one', () => {
      const checkIn: WellnessCheckIn = {
        id: 'c1',
        timestamp: '2025-01-15T10:00:00Z',
        mood: 4,
        energy: 3,
        stress: 2,
      }
      useOctaviusStore.getState().addCheckIn(checkIn)
      expect(latestCheckIn(useOctaviusStore.getState())).toEqual(checkIn)
    })

    it('returns the check-in with the most recent timestamp', () => {
      const older: WellnessCheckIn = {
        id: 'c1',
        timestamp: '2025-01-14T08:00:00Z',
        mood: 2,
        energy: 2,
        stress: 4,
      }
      const newest: WellnessCheckIn = {
        id: 'c2',
        timestamp: '2025-01-16T12:00:00Z',
        mood: 5,
        energy: 5,
        stress: 1,
      }
      const middle: WellnessCheckIn = {
        id: 'c3',
        timestamp: '2025-01-15T10:00:00Z',
        mood: 3,
        energy: 3,
        stress: 3,
      }
      // Add out of chronological order to verify it picks by timestamp, not insertion order
      useOctaviusStore.getState().addCheckIn(older)
      useOctaviusStore.getState().addCheckIn(newest)
      useOctaviusStore.getState().addCheckIn(middle)
      expect(latestCheckIn(useOctaviusStore.getState())).toEqual(newest)
    })
  })
})

import fc from 'fast-check'

const moodArb = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>

const checkInArb = fc.record({
  id: fc.uuid(),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
  mood: moodArb,
  energy: moodArb,
  stress: moodArb,
})

describe('Property 3: Most Recent Check-In Display', () => {
  /**
   * **Validates: Requirements 2.6**
   *
   * For any non-empty array of WellnessCheckIn records added to the store,
   * latestCheckIn(state) returns the one with the latest timestamp.
   */
  it('latestCheckIn returns the check-in with the most recent timestamp', () => {
    fc.assert(
      fc.property(fc.array(checkInArb, { minLength: 1, maxLength: 20 }), (checkIns) => {
        useOctaviusStore.setState(defaultState)

        for (const ci of checkIns) {
          useOctaviusStore.getState().addCheckIn(ci)
        }

        const state = useOctaviusStore.getState()
        const latest = latestCheckIn(state)

        // Find the expected latest by timestamp
        const expected = checkIns.reduce((best, current) =>
          current.timestamp > best.timestamp ? current : best,
        )

        expect(latest).toEqual(expected)
      }),
      { numRuns: 150 },
    )
  })
})
