import { describe, it, expect } from 'vitest'
import { computeBalanceScore } from './balance-score'

describe('computeBalanceScore', () => {
  it('returns all zeros when all counts are 0', () => {
    const result = computeBalanceScore({ health: 0, career: 0, relationships: 0, soul: 0 })
    expect(result).toEqual({ health: 0, career: 0, relationships: 0, soul: 0 })
  })

  it('returns all 1s when all counts are equal and non-zero', () => {
    const result = computeBalanceScore({ health: 5, career: 5, relationships: 5, soul: 5 })
    expect(result).toEqual({ health: 1, career: 1, relationships: 1, soul: 1 })
  })

  it('normalizes relative to the maximum count', () => {
    const result = computeBalanceScore({ health: 10, career: 5, relationships: 2, soul: 0 })
    expect(result).toEqual({ health: 1, career: 0.5, relationships: 0.2, soul: 0 })
  })

  it('handles a single non-zero quadrant', () => {
    const result = computeBalanceScore({ health: 0, career: 0, relationships: 0, soul: 7 })
    expect(result).toEqual({ health: 0, career: 0, relationships: 0, soul: 1 })
  })

  it('produces values in [0, 1] range', () => {
    const result = computeBalanceScore({ health: 3, career: 8, relationships: 1, soul: 4 })
    for (const value of Object.values(result)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    // career is the max, so it should be 1
    expect(result.career).toBe(1)
  })
})

import fc from 'fast-check'

describe('Feature: octavius-mvp-dashboard, Property 12: Quadrant Balance Score Computation', () => {
  it('returns values in [0, 1], max quadrant gets 1.0 (unless all zero), each value equals count/max', () => {
    fc.assert(
      fc.property(
        fc.nat(), fc.nat(), fc.nat(), fc.nat(),
        (health, career, relationships, soul) => {
          const counts = { health, career, relationships, soul }
          const result = computeBalanceScore(counts)
          const max = Math.max(health, career, relationships, soul)

          // All values in [0, 1]
          for (const v of Object.values(result)) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
          }

          if (max === 0) {
            // All zero → all results zero
            expect(result).toEqual({ health: 0, career: 0, relationships: 0, soul: 0 })
          } else {
            // Max quadrant gets 1.0
            if (health === max) expect(result.health).toBe(1)
            if (career === max) expect(result.career).toBe(1)
            if (relationships === max) expect(result.relationships).toBe(1)
            if (soul === max) expect(result.soul).toBe(1)

            // Each value equals count/max
            expect(result.health).toBeCloseTo(health / max)
            expect(result.career).toBeCloseTo(career / max)
            expect(result.relationships).toBeCloseTo(relationships / max)
            expect(result.soul).toBeCloseTo(soul / max)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
