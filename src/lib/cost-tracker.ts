import type { AgentTask } from '@/types'

/** Tier-based cost rates in USD per 1k tokens */
export type TierCostRates = { 1: number; 2: number; 3: number }

/**
 * Rough heuristic: estimate token count from task description length.
 * Assumes ~4 characters per token (common approximation for English text),
 * with a minimum of 100 tokens per task to account for system prompt overhead.
 */
export function estimateTokens(task: AgentTask): number {
  const descriptionTokens = Math.ceil(task.description.length / 4)
  return Math.max(descriptionTokens, 100)
}

/**
 * Estimate the daily cost for a set of completed agent tasks.
 *
 * Sums tier-based cost estimates: for each completed task,
 * estimate tokens from description length, then multiply by
 * the per-1k-token rate for that task's tier.
 *
 * Only tasks with status 'complete' are counted.
 *
 * @param tasks - Array of agent tasks (only completed ones are summed)
 * @param rates - Cost rates per 1k tokens, keyed by tier (1, 2, 3)
 * @returns Estimated daily cost in USD
 */
export function estimateDailyCost(
  tasks: AgentTask[],
  rates: TierCostRates,
): number {
  return tasks
    .filter((t) => t.status === 'complete')
    .reduce((sum, task) => {
      const tokens = estimateTokens(task)
      const costPerToken = rates[task.tier] / 1000
      return sum + tokens * costPerToken
    }, 0)
}
