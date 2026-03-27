/**
 * Shared in-memory store for active research tasks.
 * Lives outside app/ so both the POST route and SSE stream route
 * can import the same singleton Map.
 */
import type { ResearchState } from './types'

export const researchTasks = new Map<string, ResearchState>()

/**
 * Register a research task before starting deepResearch().
 * This ensures the ID is available immediately for the response.
 */
export function registerResearch(id: string, query: string): ResearchState {
  const state: ResearchState = {
    id,
    query,
    status: 'planning',
    learnings: [],
    visitedUrls: [],
    gaps: [query],
    currentDepth: 0,
    totalSearches: 0,
    tokenUsage: 0,
    progress: [],
    startedAt: Date.now(),
  }
  researchTasks.set(id, state)
  return state
}

/**
 * Clean up completed research after a delay.
 */
export function scheduleCleanup(id: string, delayMs = 300_000) {
  setTimeout(() => researchTasks.delete(id), delayMs)
}
