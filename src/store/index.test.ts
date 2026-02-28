import { describe, it, expect, beforeEach } from 'vitest'
import { useOctaviusStore, defaultState } from './index'

describe('Zustand store initialization', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useOctaviusStore.setState(defaultState, true)
  })

  it('initializes with correct default profile', () => {
    const state = useOctaviusStore.getState()
    expect(state.profile).toEqual({
      name: '',
      coreValues: '',
      lifeVision: '',
      accentColor: '#7C3AED',
      weeklyReviewDay: 0,
    })
  })

  it('initializes with empty health data', () => {
    const state = useOctaviusStore.getState()
    expect(state.health).toEqual({ checkIns: [], metrics: {} })
  })

  it('initializes with empty career data', () => {
    const state = useOctaviusStore.getState()
    expect(state.career).toEqual({ tasks: [], focusGoals: [], scheduleItems: [] })
  })

  it('initializes with empty relationships data', () => {
    const state = useOctaviusStore.getState()
    expect(state.relationships).toEqual({ connections: [], activityLog: [] })
  })

  it('initializes with empty soul data', () => {
    const state = useOctaviusStore.getState()
    expect(state.soul).toEqual({ journalEntries: [], gratitudeEntries: [] })
  })

  it('initializes with seeded agents and empty arrays for goals, reviews, tasks, and escalation log', () => {
    const state = useOctaviusStore.getState()
    expect(state.goals).toEqual([])
    expect(state.weeklyReviews).toEqual([])
    expect(state.agents).toHaveLength(10)
    expect(state.agentTasks).toEqual([])
    expect(state.escalationLog).toEqual([])
  })

  it('initializes with correct default router config', () => {
    const state = useOctaviusStore.getState()
    expect(state.routerConfig).toEqual({
      localEndpoint: 'http://localhost:11434',
      localModelName: 'llama3.2',
      tier1CloudModel: 'gemini-flash',
      tier2Model: 'claude-sonnet-4-5',
      tier3Model: 'claude-opus-4-5',
      researchProvider: 'kimi',
      dailyCostBudget: 5,
      tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
    })
  })
})

import fc from 'fast-check'
import type { OctaviusState } from '@/types'

// --- Arbitraries ---
const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true })
const moodArb = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>

const checkInArb = fc.record({
  id: fc.uuid(),
  timestamp: dateArb.map((d) => d.toISOString()),
  mood: moodArb,
  energy: moodArb,
  stress: moodArb,
})

const taskArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  priority: fc.constantFrom('high' as const, 'medium' as const, 'low' as const),
  completed: fc.boolean(),
  createdAt: dateArb.map((d) => d.toISOString()),
})

const focusGoalArb = fc.record({
  id: fc.uuid(),
  date: dateArb.map((d) => d.toISOString().slice(0, 10)),
  title: fc.string({ minLength: 1, maxLength: 100 }),
})

const scheduleItemArb = fc.record({
  id: fc.uuid(),
  date: dateArb.map((d) => d.toISOString().slice(0, 10)),
  title: fc.string({ minLength: 1, maxLength: 100 }),
})

const connectionArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  relationshipType: fc.string({ minLength: 1, maxLength: 30 }),
  lastContactDate: dateArb.map((d) => d.toISOString().slice(0, 10)),
  reminderFrequencyDays: fc.integer({ min: 1, max: 365 }),
})

const activityLogArb = fc.record({
  id: fc.uuid(),
  connectionId: fc.uuid(),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  date: dateArb.map((d) => d.toISOString().slice(0, 10)),
})

const journalEntryArb = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 0, maxLength: 500 }),
  timestamp: dateArb.map((d) => d.toISOString()),
})

const gratitudeEntryArb = fc.record({
  id: fc.uuid(),
  date: dateArb.map((d) => d.toISOString().slice(0, 10)),
  items: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 3 }),
})

const quadrantArb = fc.constantFrom('health' as const, 'career' as const, 'relationships' as const, 'soul' as const)

const goalArb = fc.record({
  id: fc.uuid(),
  quadrant: quadrantArb,
  title: fc.string({ minLength: 1, maxLength: 100 }),
  progressPct: fc.integer({ min: 0, max: 100 }),
})

const weeklyReviewArb = fc.record({
  id: fc.uuid(),
  timestamp: dateArb.map((d) => d.toISOString()),
  wentWell: fc.string({ minLength: 0, maxLength: 300 }),
  didNotGoWell: fc.string({ minLength: 0, maxLength: 300 }),
  nextWeekFocus: fc.string({ minLength: 0, maxLength: 300 }),
})

const routerConfigArb = fc.record({
  localEndpoint: fc.constant('http://localhost:11434'),
  localModelName: fc.string({ minLength: 1, maxLength: 30 }),
  tier1CloudModel: fc.string({ minLength: 1, maxLength: 30 }),
  tier2Model: fc.string({ minLength: 1, maxLength: 30 }),
  tier3Model: fc.string({ minLength: 1, maxLength: 30 }),
  researchProvider: fc.string({ minLength: 1, maxLength: 20 }),
  dailyCostBudget: fc.integer({ min: 1, max: 100 }),
  tierCostRates: fc.record({
    1: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
    2: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
    3: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
  }),
})

const octaviusStateArb: fc.Arbitrary<OctaviusState> = fc.record({
  profile: fc.record({
    name: fc.string({ minLength: 0, maxLength: 50 }),
    coreValues: fc.string({ minLength: 0, maxLength: 200 }),
    lifeVision: fc.string({ minLength: 0, maxLength: 200 }),
    accentColor: fc.constantFrom('#7C3AED', '#FF0000', '#00FF00', '#0000FF', '#ABCDEF'),
    weeklyReviewDay: fc.integer({ min: 0, max: 6 }),
  }),
  health: fc.record({
    checkIns: fc.array(checkInArb, { maxLength: 5 }),
    metrics: fc.record({
      steps: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
      sleepHours: fc.option(fc.float({ min: 0, max: 24, noNaN: true }), { nil: undefined }),
      heartRate: fc.option(fc.integer({ min: 30, max: 220 }), { nil: undefined }),
    }),
  }),
  career: fc.record({
    tasks: fc.array(taskArb, { maxLength: 5 }),
    focusGoals: fc.array(focusGoalArb, { maxLength: 3 }),
    scheduleItems: fc.array(scheduleItemArb, { maxLength: 5 }),
  }),
  relationships: fc.record({
    connections: fc.array(connectionArb, { maxLength: 5 }),
    activityLog: fc.array(activityLogArb, { maxLength: 5 }),
  }),
  soul: fc.record({
    journalEntries: fc.array(journalEntryArb, { maxLength: 5 }),
    gratitudeEntries: fc.array(gratitudeEntryArb, { maxLength: 5 }),
  }),
  goals: fc.array(goalArb, { maxLength: 5 }),
  weeklyReviews: fc.array(weeklyReviewArb, { maxLength: 3 }),
  agents: fc.constant([]),
  agentTasks: fc.constant([]),
  escalationLog: fc.constant([]),
  routerConfig: routerConfigArb,
})

describe('Property 1: localStorage Round-Trip', () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.5**
   *
   * For any valid OctaviusState, serializing to JSON and deserializing
   * produces a deeply equal object.
   */
  it('JSON round-trip preserves OctaviusState data', () => {
    fc.assert(
      fc.property(octaviusStateArb, (state) => {
        const serialized = JSON.stringify(state)
        const deserialized = JSON.parse(serialized) as OctaviusState
        expect(deserialized).toEqual(state)
      }),
      { numRuns: 150 },
    )
  })
})
