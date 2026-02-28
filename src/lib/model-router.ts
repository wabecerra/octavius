import type { ModelRouterConfig, ModelTier, RoutingDecision } from '@/types'

/**
 * Determine the model tier from a complexity score (1–10).
 * ≤ 4 → Tier 1, 5–7 → Tier 2, ≥ 8 → Tier 3
 */
function assignTier(score: number): ModelTier {
  if (score <= 4) return 1
  if (score <= 7) return 2
  return 3
}

/**
 * Pure routing function — no side effects.
 * Maps a complexity score + config + local reachability to a RoutingDecision.
 */
export function routeTask(
  score: number,
  config: ModelRouterConfig,
  localReachable: boolean,
): RoutingDecision {
  const tier = assignTier(score)

  if (tier === 1) {
    const useLocal = config.localEndpoint !== '' && localReachable
    if (useLocal) {
      return {
        tier: 1,
        model: config.localModelName,
        endpoint: config.localEndpoint,
        isLocal: true,
      }
    }
    return {
      tier: 1,
      model: config.tier1CloudModel,
      endpoint: `https://api.cloud/${config.tier1CloudModel}`,
      isLocal: false,
    }
  }

  if (tier === 2) {
    return {
      tier: 2,
      model: config.tier2Model,
      endpoint: `https://api.cloud/${config.tier2Model}`,
      isLocal: false,
    }
  }

  return {
    tier: 3,
    model: config.tier3Model,
    endpoint: `https://api.cloud/${config.tier3Model}`,
    isLocal: false,
  }
}

/**
 * Three-strike escalation — returns the next tier when a task has
 * accumulated 3+ consecutive failures, capped at tier 3.
 * If fewer than 3 failures, the current tier is returned unchanged.
 */
export function getEscalatedTier(
  tier: ModelTier,
  consecutiveFailures: number,
): ModelTier {
  if (consecutiveFailures >= 3 && tier < 3) {
    return (tier + 1) as ModelTier
  }
  return tier
}

/**
 * Budget gate — determines whether a task at the given tier may be dispatched.
 * Tier 1 is never blocked (cheap / local models must always remain available).
 * Tier 2 and 3 are blocked once currentSpend meets or exceeds the daily budget.
 */
export function canDispatch(
  tier: ModelTier,
  currentSpend: number,
  config: ModelRouterConfig,
): boolean {
  if (tier === 1) return true
  return currentSpend < config.dailyCostBudget
}
