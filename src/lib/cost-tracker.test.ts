import { describe, it, expect } from 'vitest'
import { estimateDailyCost, estimateTokens } from './cost-tracker'
import type { AgentTask } from '@/types'

const defaultRates = { 1: 0.01, 2: 0.05, 3: 0.15 } as const

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    agentId: 'agent-1',
    description: 'A simple task',
    complexityScore: 3,
    tier: 1,
    modelUsed: 'llama3.2',
    status: 'complete',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('estimateTokens', () => {
  it('estimates tokens from description length (4 chars per token)', () => {
    const task = makeTask({ description: 'a'.repeat(400) })
    expect(estimateTokens(task)).toBe(100) // 400/4 = 100
  })

  it('returns minimum 100 tokens for short descriptions', () => {
    const task = makeTask({ description: 'hi' })
    expect(estimateTokens(task)).toBe(100)
  })

  it('rounds up for non-divisible lengths', () => {
    const task = makeTask({ description: 'a'.repeat(401) })
    expect(estimateTokens(task)).toBe(101) // ceil(401/4) = 101
  })
})

describe('estimateDailyCost', () => {
  it('returns 0 for empty task list', () => {
    expect(estimateDailyCost([], defaultRates)).toBe(0)
  })

  it('returns 0 when no tasks are complete', () => {
    const tasks = [
      makeTask({ status: 'pending' }),
      makeTask({ status: 'running' }),
      makeTask({ status: 'failed' }),
    ]
    expect(estimateDailyCost(tasks, defaultRates)).toBe(0)
  })

  it('sums cost for a single completed tier 1 task', () => {
    const task = makeTask({ description: 'a'.repeat(400), tier: 1 })
    // 100 tokens * 0.01/1000 = 0.001
    expect(estimateDailyCost([task], defaultRates)).toBeCloseTo(0.001)
  })

  it('sums cost for a single completed tier 2 task', () => {
    const task = makeTask({ description: 'a'.repeat(400), tier: 2 })
    // 100 tokens * 0.05/1000 = 0.005
    expect(estimateDailyCost([task], defaultRates)).toBeCloseTo(0.005)
  })

  it('sums cost for a single completed tier 3 task', () => {
    const task = makeTask({ description: 'a'.repeat(400), tier: 3 })
    // 100 tokens * 0.15/1000 = 0.015
    expect(estimateDailyCost([task], defaultRates)).toBeCloseTo(0.015)
  })

  it('sums costs across multiple completed tasks of different tiers', () => {
    const tasks = [
      makeTask({ id: '1', description: 'a'.repeat(400), tier: 1 }),
      makeTask({ id: '2', description: 'a'.repeat(400), tier: 2 }),
      makeTask({ id: '3', description: 'a'.repeat(400), tier: 3 }),
    ]
    // 0.001 + 0.005 + 0.015 = 0.021
    expect(estimateDailyCost(tasks, defaultRates)).toBeCloseTo(0.021)
  })

  it('ignores non-complete tasks in the sum', () => {
    const tasks = [
      makeTask({ id: '1', description: 'a'.repeat(400), tier: 1, status: 'complete' }),
      makeTask({ id: '2', description: 'a'.repeat(400), tier: 3, status: 'failed' }),
      makeTask({ id: '3', description: 'a'.repeat(400), tier: 2, status: 'pending' }),
    ]
    // Only task 1: 100 * 0.01/1000 = 0.001
    expect(estimateDailyCost(tasks, defaultRates)).toBeCloseTo(0.001)
  })

  it('uses minimum 100 tokens for short descriptions', () => {
    const task = makeTask({ description: 'hi', tier: 1 })
    // 100 tokens * 0.01/1000 = 0.001
    expect(estimateDailyCost([task], defaultRates)).toBeCloseTo(0.001)
  })

  it('handles custom rates', () => {
    const customRates = { 1: 0.1, 2: 0.5, 3: 1.5 }
    const task = makeTask({ description: 'a'.repeat(4000), tier: 2 })
    // 1000 tokens * 0.5/1000 = 0.5
    expect(estimateDailyCost([task], customRates)).toBeCloseTo(0.5)
  })
})

import fc from 'fast-check'

const agentTaskArb = fc.record({
  id: fc.uuid(),
  agentId: fc.uuid(),
  description: fc.string({ minLength: 1, maxLength: 2000 }),
  complexityScore: fc.integer({ min: 1, max: 10 }),
  tier: fc.constantFrom(1 as const, 2 as const, 3 as const),
  modelUsed: fc.constantFrom('llama3.2', 'gemini-flash', 'claude-sonnet-4-5', 'claude-opus-4-5'),
  status: fc.constant('complete' as const),
  createdAt: fc.date().map((d) => d.toISOString()),
})

const tierRatesArb = fc.record({
  1: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
  2: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
  3: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
})

describe('Feature: octavius-mvp-dashboard, Property 21: Daily Cost Estimate Accuracy', () => {
  it('estimateDailyCost equals manual sum of estimateTokens(t) * rates[t.tier] / 1000', () => {
    fc.assert(
      fc.property(
        fc.array(agentTaskArb, { minLength: 0, maxLength: 20 }),
        tierRatesArb,
        (tasks, rates) => {
          const result = estimateDailyCost(tasks, rates)

          // Manual computation
          const expected = tasks
            .filter((t) => t.status === 'complete')
            .reduce((sum, t) => {
              const tokens = estimateTokens(t)
              return sum + (tokens * rates[t.tier]) / 1000
            }, 0)

          expect(result).toBeCloseTo(expected, 10)
        },
      ),
      { numRuns: 100 },
    )
  })
})
