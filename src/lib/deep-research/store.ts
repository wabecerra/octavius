/**
 * Shared in-memory store for active research tasks.
 * Uses globalThis to survive Next.js dev server module hot-reloading
 * and route isolation across different webpack contexts.
 */
import type { ResearchState } from './types'

const GLOBAL_KEY = '__octavius_research_tasks__' as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map<string, ResearchState>()
export const researchTasks: Map<string, ResearchState> = g[GLOBAL_KEY]

const MAX_TASKS = 100
const STALE_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Register a research task before starting deepResearch().
 * This ensures the ID is available immediately for the response.
 */
export function registerResearch(id: string, query: string): ResearchState {
  // Evict stale entries before adding new ones
  if (researchTasks.size >= MAX_TASKS) {
    const now = Date.now()
    for (const [key, state] of researchTasks) {
      if (now - state.startedAt > STALE_MS || state.status === 'complete' || state.status === 'error') {
        researchTasks.delete(key)
      }
    }
  }

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
