import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState } from './index'
import type { Task, FocusGoal, ScheduleItem } from '@/types'

describe('Career slice', () => {
  beforeEach(() => {
    useOctaviusStore.setState(defaultState)
  })

  describe('createTask', () => {
    it('appends a task to career.tasks', () => {
      const task: Task = {
        id: 't1',
        title: 'Ship feature',
        priority: 'high',
        completed: false,
        createdAt: '2025-01-15T10:00:00Z',
      }
      useOctaviusStore.getState().createTask(task)
      const state = useOctaviusStore.getState()
      expect(state.career.tasks).toHaveLength(1)
      expect(state.career.tasks[0]).toEqual(task)
    })

    it('preserves existing tasks when adding a new one', () => {
      const t1: Task = { id: 't1', title: 'First', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      const t2: Task = { id: 't2', title: 'Second', priority: 'medium', completed: false, createdAt: '2025-01-16T10:00:00Z' }
      useOctaviusStore.getState().createTask(t1)
      useOctaviusStore.getState().createTask(t2)
      const state = useOctaviusStore.getState()
      expect(state.career.tasks).toHaveLength(2)
      expect(state.career.tasks[0]).toEqual(t1)
      expect(state.career.tasks[1]).toEqual(t2)
    })
  })

  describe('editTask', () => {
    it('updates the matching task fields', () => {
      const task: Task = { id: 't1', title: 'Original', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      useOctaviusStore.getState().createTask(task)
      useOctaviusStore.getState().editTask('t1', { title: 'Updated', priority: 'high' })
      const updated = useOctaviusStore.getState().career.tasks[0]
      expect(updated.title).toBe('Updated')
      expect(updated.priority).toBe('high')
      expect(updated.id).toBe('t1')
      expect(updated.completed).toBe(false)
    })

    it('does not affect other tasks', () => {
      const t1: Task = { id: 't1', title: 'First', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      const t2: Task = { id: 't2', title: 'Second', priority: 'medium', completed: false, createdAt: '2025-01-16T10:00:00Z' }
      useOctaviusStore.getState().createTask(t1)
      useOctaviusStore.getState().createTask(t2)
      useOctaviusStore.getState().editTask('t1', { completed: true })
      const state = useOctaviusStore.getState()
      expect(state.career.tasks[0].completed).toBe(true)
      expect(state.career.tasks[1]).toEqual(t2)
    })

    it('is a no-op when id does not match any task', () => {
      const task: Task = { id: 't1', title: 'Only', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      useOctaviusStore.getState().createTask(task)
      useOctaviusStore.getState().editTask('nonexistent', { title: 'Nope' })
      expect(useOctaviusStore.getState().career.tasks[0]).toEqual(task)
    })
  })

  describe('deleteTask', () => {
    it('removes the task with the matching id', () => {
      const task: Task = { id: 't1', title: 'Delete me', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      useOctaviusStore.getState().createTask(task)
      useOctaviusStore.getState().deleteTask('t1')
      expect(useOctaviusStore.getState().career.tasks).toHaveLength(0)
    })

    it('preserves other tasks when deleting one', () => {
      const t1: Task = { id: 't1', title: 'Keep', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      const t2: Task = { id: 't2', title: 'Remove', priority: 'high', completed: false, createdAt: '2025-01-16T10:00:00Z' }
      useOctaviusStore.getState().createTask(t1)
      useOctaviusStore.getState().createTask(t2)
      useOctaviusStore.getState().deleteTask('t2')
      const state = useOctaviusStore.getState()
      expect(state.career.tasks).toHaveLength(1)
      expect(state.career.tasks[0]).toEqual(t1)
    })

    it('is a no-op when id does not match', () => {
      const task: Task = { id: 't1', title: 'Stay', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' }
      useOctaviusStore.getState().createTask(task)
      useOctaviusStore.getState().deleteTask('nonexistent')
      expect(useOctaviusStore.getState().career.tasks).toHaveLength(1)
    })
  })

  describe('addFocusGoal', () => {
    it('adds a focus goal and returns true', () => {
      const goal: FocusGoal = { id: 'g1', date: '2025-01-15', title: 'Ship MVP' }
      const result = useOctaviusStore.getState().addFocusGoal(goal)
      expect(result).toBe(true)
      expect(useOctaviusStore.getState().career.focusGoals).toHaveLength(1)
      expect(useOctaviusStore.getState().career.focusGoals[0]).toEqual(goal)
    })

    it('allows up to 3 goals for the same date', () => {
      const goals: FocusGoal[] = [
        { id: 'g1', date: '2025-01-15', title: 'Goal 1' },
        { id: 'g2', date: '2025-01-15', title: 'Goal 2' },
        { id: 'g3', date: '2025-01-15', title: 'Goal 3' },
      ]
      for (const g of goals) {
        expect(useOctaviusStore.getState().addFocusGoal(g)).toBe(true)
      }
      expect(useOctaviusStore.getState().career.focusGoals).toHaveLength(3)
    })

    it('rejects a 4th goal for the same date and returns false', () => {
      const date = '2025-01-15'
      for (let i = 1; i <= 3; i++) {
        useOctaviusStore.getState().addFocusGoal({ id: `g${i}`, date, title: `Goal ${i}` })
      }
      const fourth: FocusGoal = { id: 'g4', date, title: 'Goal 4' }
      const result = useOctaviusStore.getState().addFocusGoal(fourth)
      expect(result).toBe(false)
      expect(useOctaviusStore.getState().career.focusGoals).toHaveLength(3)
    })

    it('allows goals on different dates independently', () => {
      for (let i = 1; i <= 3; i++) {
        useOctaviusStore.getState().addFocusGoal({ id: `a${i}`, date: '2025-01-15', title: `Day1 Goal ${i}` })
      }
      const differentDay: FocusGoal = { id: 'b1', date: '2025-01-16', title: 'Day2 Goal 1' }
      const result = useOctaviusStore.getState().addFocusGoal(differentDay)
      expect(result).toBe(true)
      expect(useOctaviusStore.getState().career.focusGoals).toHaveLength(4)
    })

    it('does not modify store when rejecting a goal', () => {
      const date = '2025-01-15'
      for (let i = 1; i <= 3; i++) {
        useOctaviusStore.getState().addFocusGoal({ id: `g${i}`, date, title: `Goal ${i}` })
      }
      const before = useOctaviusStore.getState().career.focusGoals
      useOctaviusStore.getState().addFocusGoal({ id: 'g4', date, title: 'Rejected' })
      const after = useOctaviusStore.getState().career.focusGoals
      expect(after).toEqual(before)
    })
  })

  describe('addScheduleItem', () => {
    it('appends a schedule item to career.scheduleItems', () => {
      const item: ScheduleItem = { id: 's1', date: '2025-01-15', title: 'Standup', startTime: '09:00', endTime: '09:15' }
      useOctaviusStore.getState().addScheduleItem(item)
      const state = useOctaviusStore.getState()
      expect(state.career.scheduleItems).toHaveLength(1)
      expect(state.career.scheduleItems[0]).toEqual(item)
    })

    it('preserves existing schedule items', () => {
      const s1: ScheduleItem = { id: 's1', date: '2025-01-15', title: 'Standup' }
      const s2: ScheduleItem = { id: 's2', date: '2025-01-15', title: 'Lunch' }
      useOctaviusStore.getState().addScheduleItem(s1)
      useOctaviusStore.getState().addScheduleItem(s2)
      expect(useOctaviusStore.getState().career.scheduleItems).toHaveLength(2)
    })
  })

  describe('cross-slice isolation', () => {
    it('career actions do not affect health data', () => {
      useOctaviusStore.getState().updateMetrics({ steps: 8000 })
      useOctaviusStore.getState().createTask({ id: 't1', title: 'Task', priority: 'low', completed: false, createdAt: '2025-01-15T10:00:00Z' })
      expect(useOctaviusStore.getState().health.metrics).toEqual({ steps: 8000 })
    })
  })
})

import fc from 'fast-check'

const priorityArb = fc.constantFrom('high' as const, 'medium' as const, 'low' as const)

const taskPropArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  priority: priorityArb,
  completed: fc.boolean(),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
})

describe('Property 4: Task CRUD Round-Trip', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * For any Task, after createTask + read back, deeply equal.
   * After editTask, updated fields reflected. After deleteTask, task is gone.
   */
  it('create → read → edit → read → delete → read round-trip', () => {
    fc.assert(
      fc.property(taskPropArb, fc.string({ minLength: 1, maxLength: 100 }), (task, newTitle) => {
        useOctaviusStore.setState(defaultState)

        // Create
        useOctaviusStore.getState().createTask(task)
        const created = useOctaviusStore.getState().career.tasks.find((t) => t.id === task.id)
        expect(created).toEqual(task)

        // Edit
        useOctaviusStore.getState().editTask(task.id, { title: newTitle })
        const edited = useOctaviusStore.getState().career.tasks.find((t) => t.id === task.id)
        expect(edited?.title).toBe(newTitle)
        expect(edited?.id).toBe(task.id)
        expect(edited?.priority).toBe(task.priority)

        // Delete
        useOctaviusStore.getState().deleteTask(task.id)
        const deleted = useOctaviusStore.getState().career.tasks.find((t) => t.id === task.id)
        expect(deleted).toBeUndefined()
      }),
      { numRuns: 150 },
    )
  })
})

describe('Property 5: Focus Goal Cap', () => {
  /**
   * **Validates: Requirements 3.5, 3.6**
   *
   * When 3 FocusGoals exist for a date, addFocusGoal returns false
   * and store is unchanged.
   */
  it('rejects 4th focus goal for the same date', () => {
    const focusGoalArb = fc.record({
      id: fc.uuid(),
      date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
      title: fc.string({ minLength: 1, maxLength: 100 }),
    })

    fc.assert(
      fc.property(
        fc.array(focusGoalArb, { minLength: 3, maxLength: 3 }),
        focusGoalArb,
        (threeGoals, fourthGoal) => {
          useOctaviusStore.setState(defaultState)

          // Use the same date for all goals
          const sharedDate = threeGoals[0].date
          for (const g of threeGoals) {
            useOctaviusStore.getState().addFocusGoal({ ...g, date: sharedDate })
          }

          // Attempt to add a 4th
          const before = [...useOctaviusStore.getState().career.focusGoals]
          const result = useOctaviusStore.getState().addFocusGoal({ ...fourthGoal, date: sharedDate })

          expect(result).toBe(false)
          expect(useOctaviusStore.getState().career.focusGoals).toEqual(before)
        },
      ),
      { numRuns: 150 },
    )
  })
})

describe('Property 6: Quadrant Card Counts', () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * The count of incomplete tasks equals tasks.filter(t => !t.completed).length.
   */
  it('incomplete task count matches filter', () => {
    fc.assert(
      fc.property(fc.array(taskPropArb, { minLength: 0, maxLength: 20 }), (tasks) => {
        useOctaviusStore.setState(defaultState)

        for (const t of tasks) {
          useOctaviusStore.getState().createTask(t)
        }

        const state = useOctaviusStore.getState()
        const incompleteCount = state.career.tasks.filter((t) => !t.completed).length
        const expectedCount = tasks.filter((t) => !t.completed).length

        expect(incompleteCount).toBe(expectedCount)
      }),
      { numRuns: 150 },
    )
  })
})
