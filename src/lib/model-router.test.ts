import { describe, it, expect } from 'vitest'
import { routeTask, canDispatch, getEscalatedTier } from './model-router'
import type { ModelRouterConfig } from '@/types'

const baseConfig: ModelRouterConfig = {
  localEndpoint: 'http://localhost:11434',
  localModelName: 'llama3.2',
  tier1CloudModel: 'gemini-flash',
  tier2Model: 'claude-sonnet-4-5',
  tier3Model: 'claude-opus-4-5',
  researchProvider: 'kimi',
  dailyCostBudget: 5,
  tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
}

describe('routeTask — tier assignment', () => {
  it('assigns Tier 1 for scores 1–4', () => {
    for (const score of [1, 2, 3, 4]) {
      expect(routeTask(score, baseConfig, false).tier).toBe(1)
    }
  })

  it('assigns Tier 2 for scores 5–7', () => {
    for (const score of [5, 6, 7]) {
      expect(routeTask(score, baseConfig, false).tier).toBe(2)
    }
  })

  it('assigns Tier 3 for scores 8–10', () => {
    for (const score of [8, 9, 10]) {
      expect(routeTask(score, baseConfig, false).tier).toBe(3)
    }
  })
})

describe('routeTask — Tier 1 local routing', () => {
  it('uses local endpoint when configured and reachable', () => {
    const decision = routeTask(3, baseConfig, true)
    expect(decision).toEqual({
      tier: 1,
      model: 'llama3.2',
      endpoint: 'http://localhost:11434',
      isLocal: true,
    })
  })

  it('falls back to cloud when local is not reachable', () => {
    const decision = routeTask(3, baseConfig, false)
    expect(decision).toEqual({
      tier: 1,
      model: 'gemini-flash',
      endpoint: 'https://api.cloud/gemini-flash',
      isLocal: false,
    })
  })

  it('falls back to cloud when localEndpoint is empty', () => {
    const config = { ...baseConfig, localEndpoint: '' }
    const decision = routeTask(2, config, true)
    expect(decision).toEqual({
      tier: 1,
      model: 'gemini-flash',
      endpoint: 'https://api.cloud/gemini-flash',
      isLocal: false,
    })
  })
})

describe('routeTask — Tier 2 and Tier 3 cloud routing', () => {
  it('routes Tier 2 to the configured tier2Model', () => {
    const decision = routeTask(6, baseConfig, true)
    expect(decision).toEqual({
      tier: 2,
      model: 'claude-sonnet-4-5',
      endpoint: 'https://api.cloud/claude-sonnet-4-5',
      isLocal: false,
    })
  })

  it('routes Tier 3 to the configured tier3Model', () => {
    const decision = routeTask(9, baseConfig, true)
    expect(decision).toEqual({
      tier: 3,
      model: 'claude-opus-4-5',
      endpoint: 'https://api.cloud/claude-opus-4-5',
      isLocal: false,
    })
  })

  it('Tier 2 and 3 are never local regardless of reachability', () => {
    expect(routeTask(5, baseConfig, true).isLocal).toBe(false)
    expect(routeTask(8, baseConfig, true).isLocal).toBe(false)
  })
})

describe('canDispatch — cost budget enforcement', () => {
  it('always allows tier 1 even when budget is exceeded', () => {
    expect(canDispatch(1, 10, baseConfig)).toBe(true)
    expect(canDispatch(1, 5, baseConfig)).toBe(true)
    expect(canDispatch(1, 999, baseConfig)).toBe(true)
  })

  it('allows tier 2 when spend is below budget', () => {
    expect(canDispatch(2, 0, baseConfig)).toBe(true)
    expect(canDispatch(2, 4.99, baseConfig)).toBe(true)
  })

  it('allows tier 3 when spend is below budget', () => {
    expect(canDispatch(3, 0, baseConfig)).toBe(true)
    expect(canDispatch(3, 4.99, baseConfig)).toBe(true)
  })

  it('blocks tier 2 when spend equals budget', () => {
    expect(canDispatch(2, 5, baseConfig)).toBe(false)
  })

  it('blocks tier 3 when spend equals budget', () => {
    expect(canDispatch(3, 5, baseConfig)).toBe(false)
  })

  it('blocks tier 2 when spend exceeds budget', () => {
    expect(canDispatch(2, 7.5, baseConfig)).toBe(false)
  })

  it('blocks tier 3 when spend exceeds budget', () => {
    expect(canDispatch(3, 100, baseConfig)).toBe(false)
  })

  it('tier 1 is never blocked regardless of spend', () => {
    expect(canDispatch(1, 0, baseConfig)).toBe(true)
    expect(canDispatch(1, 5, baseConfig)).toBe(true)
    expect(canDispatch(1, 100, baseConfig)).toBe(true)
  })
})


describe('getEscalatedTier — three-strike escalation', () => {
  it('returns the same tier when consecutiveFailures < 3', () => {
    expect(getEscalatedTier(1, 0)).toBe(1)
    expect(getEscalatedTier(1, 1)).toBe(1)
    expect(getEscalatedTier(1, 2)).toBe(1)
    expect(getEscalatedTier(2, 0)).toBe(2)
    expect(getEscalatedTier(2, 2)).toBe(2)
    expect(getEscalatedTier(3, 0)).toBe(3)
    expect(getEscalatedTier(3, 2)).toBe(3)
  })

  it('escalates tier 1 → tier 2 after 3 consecutive failures', () => {
    expect(getEscalatedTier(1, 3)).toBe(2)
  })

  it('escalates tier 2 → tier 3 after 3 consecutive failures', () => {
    expect(getEscalatedTier(2, 3)).toBe(3)
  })

  it('caps at tier 3 when already at tier 3 with 3+ failures', () => {
    expect(getEscalatedTier(3, 3)).toBe(3)
    expect(getEscalatedTier(3, 10)).toBe(3)
  })

  it('escalates for any failure count >= 3', () => {
    expect(getEscalatedTier(1, 4)).toBe(2)
    expect(getEscalatedTier(1, 100)).toBe(2)
    expect(getEscalatedTier(2, 5)).toBe(3)
  })
})

import fc from 'fast-check'

const routerConfigArb = fc.record({
  localEndpoint: fc.constantFrom('http://localhost:11434', 'http://localhost:8080', ''),
  localModelName: fc.constantFrom('llama3.2', 'mistral', 'qwen2'),
  tier1CloudModel: fc.constantFrom('gemini-flash', 'gpt-4o-mini'),
  tier2Model: fc.constantFrom('claude-sonnet-4-5', 'gpt-4o'),
  tier3Model: fc.constantFrom('claude-opus-4-5', 'gpt-4-turbo'),
  researchProvider: fc.constant('kimi'),
  dailyCostBudget: fc.float({ min: Math.fround(0.01), max: 100, noNaN: true }),
  tierCostRates: fc.record({
    1: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
    2: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
    3: fc.float({ min: Math.fround(0.001), max: 1, noNaN: true }),
  }),
})

describe('Feature: octavius-mvp-dashboard, Property 14: Model Router Tier Assignment', () => {
  it('assigns tier 1 for score ≤ 4, tier 2 for 5–7, tier 3 for ≥ 8', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        routerConfigArb,
        fc.boolean(),
        (score, config, localReachable) => {
          const decision = routeTask(score, config, localReachable)

          if (score <= 4) {
            expect(decision.tier).toBe(1)
          } else if (score <= 7) {
            expect(decision.tier).toBe(2)
          } else {
            expect(decision.tier).toBe(3)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('Feature: octavius-mvp-dashboard, Property 17: Local Model Routing Preference', () => {
  it('returns isLocal: true for tier 1 tasks when local endpoint is configured and reachable', () => {
    // Use a config arbitrary that always has a non-empty localEndpoint
    const localConfigArb = routerConfigArb.filter((c) => c.localEndpoint !== '')

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }), // tier 1 scores
        localConfigArb,
        (score, config) => {
          const decision = routeTask(score, config, true)

          expect(decision.isLocal).toBe(true)
          expect(decision.endpoint).toBe(config.localEndpoint)
          expect(decision.model).toBe(config.localModelName)
          expect(decision.tier).toBe(1)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('Feature: octavius-mvp-dashboard, Property 16: Cost Budget Enforcement', () => {
  it('blocks tier 2/3 when currentSpend >= budget, always allows tier 1', () => {
    fc.assert(
      fc.property(
        routerConfigArb,
        fc.float({ min: 0, max: 10000, noNaN: true }),
        (config, spendMultiplier) => {
          // Ensure currentSpend >= budget
          const currentSpend = config.dailyCostBudget + Math.abs(spendMultiplier)

          // Tier 1 always allowed
          expect(canDispatch(1, currentSpend, config)).toBe(true)

          // Tier 2 and 3 blocked when at or over budget
          expect(canDispatch(2, currentSpend, config)).toBe(false)
          expect(canDispatch(3, currentSpend, config)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('allows tier 2/3 when currentSpend < budget', () => {
    fc.assert(
      fc.property(
        routerConfigArb,
        fc.float({ min: 0, max: Math.fround(0.99), noNaN: true }),
        (config, fraction) => {
          // Ensure currentSpend < budget
          const currentSpend = config.dailyCostBudget * fraction

          expect(canDispatch(1, currentSpend, config)).toBe(true)
          expect(canDispatch(2, currentSpend, config)).toBe(true)
          expect(canDispatch(3, currentSpend, config)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('Feature: octavius-mvp-dashboard, Property 15: Three-Strike Escalation', () => {
  it('escalates tier by 1 after 3+ consecutive failures (capped at 3)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 }),
        fc.integer({ min: 3, max: 100 }),
        (tier, consecutiveFailures) => {
          const escalated = getEscalatedTier(tier as 1 | 2, consecutiveFailures)
          expect(escalated).toBe(tier + 1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('stays at tier 3 with 3+ failures', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 100 }),
        (consecutiveFailures) => {
          expect(getEscalatedTier(3, consecutiveFailures)).toBe(3)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('stays at current tier with < 3 failures', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 0, max: 2 }),
        (tier, consecutiveFailures) => {
          expect(getEscalatedTier(tier as 1 | 2 | 3, consecutiveFailures)).toBe(tier)
        },
      ),
      { numRuns: 100 },
    )
  })
})
