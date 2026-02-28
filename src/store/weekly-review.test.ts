import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState } from './index'
import type { WeeklyReview } from '@/types'

describe('WeeklyReview slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('addWeeklyReview', () => {
    it('appends a weekly review to the weeklyReviews array', () => {
      const review: WeeklyReview = {
        id: 'wr1',
        timestamp: '2025-01-19T18:00:00Z',
        wentWell: 'Completed all focus goals',
        didNotGoWell: 'Skipped two workouts',
        nextWeekFocus: 'Prioritize morning exercise',
      }
      useOctaviusStore.getState().addWeeklyReview(review)
      const state = useOctaviusStore.getState()
      expect(state.weeklyReviews).toHaveLength(1)
      expect(state.weeklyReviews[0]).toEqual(review)
    })

    it('preserves all fields: wentWell, didNotGoWell, nextWeekFocus, timestamp', () => {
      const review: WeeklyReview = {
        id: 'wr1',
        timestamp: '2025-01-19T18:00:00Z',
        wentWell: 'Good progress on career goals',
        didNotGoWell: 'Neglected journaling',
        nextWeekFocus: 'Write daily for 10 minutes',
      }
      useOctaviusStore.getState().addWeeklyReview(review)
      const stored = useOctaviusStore.getState().weeklyReviews[0]
      expect(stored.wentWell).toBe('Good progress on career goals')
      expect(stored.didNotGoWell).toBe('Neglected journaling')
      expect(stored.nextWeekFocus).toBe('Write daily for 10 minutes')
      expect(stored.timestamp).toBe('2025-01-19T18:00:00Z')
    })

    it('preserves existing reviews when adding a new one', () => {
      const first: WeeklyReview = {
        id: 'wr1',
        timestamp: '2025-01-12T18:00:00Z',
        wentWell: 'Week 1 wins',
        didNotGoWell: 'Week 1 misses',
        nextWeekFocus: 'Week 2 plan',
      }
      const second: WeeklyReview = {
        id: 'wr2',
        timestamp: '2025-01-19T18:00:00Z',
        wentWell: 'Week 2 wins',
        didNotGoWell: 'Week 2 misses',
        nextWeekFocus: 'Week 3 plan',
      }
      useOctaviusStore.getState().addWeeklyReview(first)
      useOctaviusStore.getState().addWeeklyReview(second)
      const state = useOctaviusStore.getState()
      expect(state.weeklyReviews).toHaveLength(2)
      expect(state.weeklyReviews[0]).toEqual(first)
      expect(state.weeklyReviews[1]).toEqual(second)
    })

    it('does not mutate other store slices', () => {
      const review: WeeklyReview = {
        id: 'wr1',
        timestamp: '2025-01-19T18:00:00Z',
        wentWell: 'test',
        didNotGoWell: 'test',
        nextWeekFocus: 'test',
      }
      useOctaviusStore.getState().addWeeklyReview(review)
      const state = useOctaviusStore.getState()
      expect(state.health).toEqual(defaultState.health)
      expect(state.career).toEqual(defaultState.career)
      expect(state.soul).toEqual(defaultState.soul)
      expect(state.goals).toEqual(defaultState.goals)
      expect(state.profile).toEqual(defaultState.profile)
    })
  })
})

import fc from 'fast-check'

const weeklyReviewPropArb = fc.record({
  id: fc.uuid(),
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
  wentWell: fc.string({ minLength: 0, maxLength: 300 }),
  didNotGoWell: fc.string({ minLength: 0, maxLength: 300 }),
  nextWeekFocus: fc.string({ minLength: 0, maxLength: 300 }),
})

describe('Property: Weekly Review Persistence Round-Trip', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any WeeklyReview, after addWeeklyReview + read back, all fields
   * (wentWell, didNotGoWell, nextWeekFocus, timestamp) are deeply equal.
   */
  it('addWeeklyReview round-trip preserves all fields', () => {
    fc.assert(
      fc.property(weeklyReviewPropArb, (review) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().addWeeklyReview(review)
        const stored = useOctaviusStore.getState().weeklyReviews.find((r) => r.id === review.id)

        expect(stored).toEqual(review)
        expect(stored?.wentWell).toBe(review.wentWell)
        expect(stored?.didNotGoWell).toBe(review.didNotGoWell)
        expect(stored?.nextWeekFocus).toBe(review.nextWeekFocus)
        expect(stored?.timestamp).toBe(review.timestamp)
      }),
      { numRuns: 150 },
    )
  })
})
