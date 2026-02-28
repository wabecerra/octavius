import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState } from './index'
import type { Goal } from '@/types'

describe('Goals slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('createGoal', () => {
    it('appends a goal to the goals array', () => {
      const goal: Goal = {
        id: 'goal1',
        quadrant: 'health',
        title: 'Run a marathon',
        description: 'Complete a full marathon by end of year',
        targetDate: '2025-12-31',
        progressPct: 0,
      }
      useOctaviusStore.getState().createGoal(goal)
      const state = useOctaviusStore.getState()
      expect(state.goals).toHaveLength(1)
      expect(state.goals[0]).toEqual(goal)
    })

    it('preserves existing goals when adding a new one', () => {
      const first: Goal = {
        id: 'goal1',
        quadrant: 'health',
        title: 'Exercise daily',
        progressPct: 25,
      }
      const second: Goal = {
        id: 'goal2',
        quadrant: 'career',
        title: 'Learn TypeScript',
        progressPct: 50,
      }
      useOctaviusStore.getState().createGoal(first)
      useOctaviusStore.getState().createGoal(second)
      const state = useOctaviusStore.getState()
      expect(state.goals).toHaveLength(2)
      expect(state.goals[0]).toEqual(first)
      expect(state.goals[1]).toEqual(second)
    })

    it('stores the quadrant association correctly', () => {
      const goal: Goal = {
        id: 'goal1',
        quadrant: 'relationships',
        title: 'Call family weekly',
        progressPct: 10,
      }
      useOctaviusStore.getState().createGoal(goal)
      expect(useOctaviusStore.getState().goals[0].quadrant).toBe('relationships')
    })
  })

  describe('updateGoalProgress', () => {
    const baseGoal: Goal = {
      id: 'goal1',
      quadrant: 'soul',
      title: 'Meditate daily',
      progressPct: 0,
    }

    beforeEach(() => {
      useOctaviusStore.getState().createGoal(baseGoal)
    })

    it('updates progress to a valid value', () => {
      const result = useOctaviusStore.getState().updateGoalProgress('goal1', 50)
      expect(result).toBe(true)
      expect(useOctaviusStore.getState().goals[0].progressPct).toBe(50)
    })

    it('accepts 0 as a valid progress value', () => {
      // First set to something non-zero
      useOctaviusStore.getState().updateGoalProgress('goal1', 30)
      const result = useOctaviusStore.getState().updateGoalProgress('goal1', 0)
      expect(result).toBe(true)
      expect(useOctaviusStore.getState().goals[0].progressPct).toBe(0)
    })

    it('accepts 100 as a valid progress value', () => {
      const result = useOctaviusStore.getState().updateGoalProgress('goal1', 100)
      expect(result).toBe(true)
      expect(useOctaviusStore.getState().goals[0].progressPct).toBe(100)
    })

    it('rejects progress below 0', () => {
      const result = useOctaviusStore.getState().updateGoalProgress('goal1', -1)
      expect(result).toBe(false)
      expect(useOctaviusStore.getState().goals[0].progressPct).toBe(0)
    })

    it('rejects progress above 100', () => {
      const result = useOctaviusStore.getState().updateGoalProgress('goal1', 101)
      expect(result).toBe(false)
      expect(useOctaviusStore.getState().goals[0].progressPct).toBe(0)
    })

    it('rejects non-integer progress values', () => {
      const result = useOctaviusStore.getState().updateGoalProgress('goal1', 50.5)
      expect(result).toBe(false)
      expect(useOctaviusStore.getState().goals[0].progressPct).toBe(0)
    })

    it('does not modify other goals when updating one', () => {
      const other: Goal = {
        id: 'goal2',
        quadrant: 'career',
        title: 'Ship feature',
        progressPct: 75,
      }
      useOctaviusStore.getState().createGoal(other)
      useOctaviusStore.getState().updateGoalProgress('goal1', 40)
      expect(useOctaviusStore.getState().goals[1].progressPct).toBe(75)
    })
  })
})

import fc from 'fast-check'

const quadrantArb = fc.constantFrom('health' as const, 'career' as const, 'relationships' as const, 'soul' as const)

const goalPropArb = fc.record({
  id: fc.uuid(),
  quadrant: quadrantArb,
  title: fc.string({ minLength: 1, maxLength: 100 }),
  progressPct: fc.integer({ min: 0, max: 100 }),
})

describe('Property 11: Goal CRUD Round-Trip', () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For any Goal, after createGoal + read back, deeply equal with correct quadrant.
   * After updateGoalProgress with valid value, progressPct is updated.
   */
  it('createGoal round-trip preserves data and quadrant', () => {
    fc.assert(
      fc.property(goalPropArb, (goal) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().createGoal(goal)
        const stored = useOctaviusStore.getState().goals.find((g) => g.id === goal.id)
        expect(stored).toEqual(goal)
        expect(stored?.quadrant).toBe(goal.quadrant)
      }),
      { numRuns: 150 },
    )
  })

  it('updateGoalProgress updates progressPct for valid values', () => {
    fc.assert(
      fc.property(goalPropArb, fc.integer({ min: 0, max: 100 }), (goal, newProgress) => {
        useOctaviusStore.setState(defaultState)

        useOctaviusStore.getState().createGoal(goal)
        const result = useOctaviusStore.getState().updateGoalProgress(goal.id, newProgress)
        expect(result).toBe(true)
        expect(useOctaviusStore.getState().goals.find((g) => g.id === goal.id)?.progressPct).toBe(newProgress)
      }),
      { numRuns: 150 },
    )
  })
})
