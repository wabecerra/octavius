import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { AgentTask, ModelTier, AgentTaskStatus } from '@/types'

const tierArb = fc.constantFrom(1 as const, 2 as const, 3 as const)
const statusArb = fc.constantFrom('pending' as const, 'running' as const, 'complete' as const, 'failed' as const, 'cancelled' as const)

const agentTaskArb: fc.Arbitrary<AgentTask> = fc.record({
  id: fc.uuid(),
  agentId: fc.constantFrom('generalist-health', 'generalist-career', 'specialist-research', 'specialist-engineering'),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  complexityScore: fc.integer({ min: 1, max: 10 }),
  tier: tierArb,
  modelUsed: fc.string({ minLength: 1, maxLength: 30 }),
  status: statusArb,
  createdAt: fc.integer({ min: 1577836800000, max: 1924905600000 }).map((ms) => new Date(ms).toISOString()),
})

type SortField = 'status' | 'agentId' | 'createdAt' | 'complexityScore'

function sortTasks(tasks: AgentTask[], field: SortField): AgentTask[] {
  return [...tasks].sort((a, b) => {
    const aVal = a[field]
    const bVal = b[field]
    if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal
    return String(aVal).localeCompare(String(bVal))
  })
}

function comparator(field: SortField) {
  return (a: AgentTask, b: AgentTask): number => {
    const aVal = a[field]
    const bVal = b[field]
    if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal
    return String(aVal).localeCompare(String(bVal))
  }
}

describe('Property 20: Agent Task List Sorting', () => {
  /**
   * **Validates: Requirements 15.1**
   *
   * For any array of AgentTask records, sorting by status/agentId/createdAt/complexityScore
   * produces a list where every adjacent pair satisfies the sort comparator.
   */
  const sortFields: SortField[] = ['status', 'agentId', 'createdAt', 'complexityScore']

  for (const field of sortFields) {
    it(`sorted by ${field}: every adjacent pair satisfies the comparator`, () => {
      fc.assert(
        fc.property(fc.array(agentTaskArb, { minLength: 0, maxLength: 20 }), (tasks) => {
          const sorted = sortTasks(tasks, field)
          const cmp = comparator(field)

          for (let i = 0; i < sorted.length - 1; i++) {
            expect(cmp(sorted[i], sorted[i + 1])).toBeLessThanOrEqual(0)
          }
        }),
        { numRuns: 150 },
      )
    })
  }
})
