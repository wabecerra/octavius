import type { AgentTask, ModelRouterConfig } from '@/types'
import { executeTask, type FetchFn, type ExecuteTaskResult } from '../agent-adapter'

/** Result from the research agent, extending base execution with search data */
export interface ResearchTaskResult {
  result: string
  sourceUrls: string[]
  isVerified: boolean
  baseResult: ExecuteTaskResult
}

/** Search response shape from Kimi-compatible API */
interface SearchResponse {
  results: Array<{ url: string; title?: string; snippet?: string }>
}

const SEARCH_COMPLEXITY_THRESHOLD = 5

/**
 * Build the search provider URL from config.
 * Kimi API: POST to https://api.kimi.ai/v1/search
 */
function getSearchUrl(config: ModelRouterConfig): string {
  return `https://api.${config.researchProvider}.ai/v1/search`
}

/**
 * Call the search provider to gather source URLs for the task.
 * Returns source URLs on success, or null on failure.
 */
async function callSearchProvider(
  query: string,
  config: ModelRouterConfig,
  fetchFn: FetchFn,
): Promise<string[] | null> {
  try {
    const url = getSearchUrl(config)
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) return null
    const data: SearchResponse = await res.json()
    return data.results?.map((r) => r.url) ?? []
  } catch {
    return null
  }
}

/**
 * Execute a research agent task.
 *
 * For tasks with complexityScore >= 5, calls the configured search provider
 * (Kimi API) to gather source URLs before generating the result.
 * Sets isVerified: false if the search call fails.
 *
 * @param task - The agent task to execute
 * @param config - Model router configuration
 * @param localReachable - Whether the local model endpoint is reachable
 * @param fetchFn - Injectable fetch function (defaults to global fetch)
 */
export async function executeResearchTask(
  task: AgentTask,
  config: ModelRouterConfig,
  localReachable: boolean = false,
  fetchFn: FetchFn = globalThis.fetch,
): Promise<ResearchTaskResult> {
  let sourceUrls: string[] = []
  let isVerified = true

  // For complex tasks, invoke search provider first
  if (task.complexityScore >= SEARCH_COMPLEXITY_THRESHOLD) {
    const urls = await callSearchProvider(task.description, config, fetchFn)
    if (urls !== null) {
      sourceUrls = urls
      isVerified = true
    } else {
      // Search failed — mark as unverified
      isVerified = false
    }
  }

  // Execute the base model task
  const baseResult = await executeTask(task, config, localReachable, fetchFn)

  return {
    result: baseResult.result,
    sourceUrls,
    isVerified,
    baseResult,
  }
}
