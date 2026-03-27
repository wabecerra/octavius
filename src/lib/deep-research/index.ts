import { generateQueries } from './planner'
import { executeSearches } from './searcher'
import { extractLearnings } from './extractor'
import { evaluateCompleteness } from './evaluator'
import { generateReport } from './synthesizer'
import type { ResearchConfig, ResearchState, Learning } from './types'

export type { ResearchConfig, ResearchState } from './types'

/**
 * Estimate tokens from text length (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function deepResearch(
  query: string,
  config: ResearchConfig,
  onProgress?: (state: ResearchState) => void,
  /** Optional pre-generated ID (used when pre-registering via store) */
  id?: string,
): Promise<ResearchState> {
  const state: ResearchState = {
    id: id || `dr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  try {
    // Phase 1: Recursive research
    await researchRecursive(query, config.maxBreadth, config.maxDepth, [], state, config, onProgress)

    // Phase 1.5: Gap evaluation — if we have enough learnings, check completeness
    if (state.learnings.length >= 5) {
      const evaluation = await evaluateCompleteness(
        query, state.learnings, state.gaps, state.tokenUsage, config,
      )
      // Estimate tokens for evaluation call (~100 tokens)
      state.tokenUsage += 100

      // Update gaps with new gaps from evaluation
      if (evaluation.newGaps.length > 0) {
        state.gaps = evaluation.newGaps
      }

      if (!evaluation.sufficient && state.totalSearches < config.maxSearches) {
        // Do one more targeted round on gaps
        const gapQueries = evaluation.newGaps.length > 0 ? evaluation.newGaps : state.gaps
        await researchRecursive(
          gapQueries[0] || query, 2, 1, state.learnings, state, config, onProgress,
        )
      }
    }

    // Phase 2: Synthesize final report
    state.status = 'synthesizing'
    addProgress(state, 'synthesize', `Synthesizing report from ${state.learnings.length} learnings`)
    onProgress?.(state)

    state.report = await generateReport(query, state.learnings, state.visitedUrls, config)
    // Estimate tokens for report generation (~2000 tokens based on typical report length)
    state.tokenUsage += estimateTokens(state.report)

    state.status = 'complete'
    state.completedAt = Date.now()
    onProgress?.(state)
  } catch (err) {
    state.status = 'error'
    state.error = err instanceof Error ? err.message : String(err)
    state.completedAt = Date.now()
    onProgress?.(state)
  }

  return state
}

async function researchRecursive(
  query: string,
  breadth: number,
  depth: number,
  priorLearnings: Learning[],
  state: ResearchState,
  config: ResearchConfig,
  onProgress?: (state: ResearchState) => void,
): Promise<void> {
  // Budget checks
  if (state.tokenUsage >= config.tokenBudget || state.totalSearches >= config.maxSearches) return

  state.status = 'researching'
  state.currentDepth = config.maxDepth - depth

  // Step 1: Generate queries
  const queries = await generateQueries(query, breadth, priorLearnings, config)
  // Estimate tokens for query generation (~200 tokens)
  state.tokenUsage += 200
  addProgress(state, 'plan', `Generated ${queries.length} queries at depth ${state.currentDepth}`)
  onProgress?.(state)

  // Step 2: Search
  const results = await executeSearches(queries, state.visitedUrls, config)
  state.totalSearches += results.length
  state.visitedUrls.push(...results.map(r => r.url))
  addProgress(state, 'search', `Found ${results.length} results (${state.totalSearches} total)`)
  onProgress?.(state)

  if (results.length === 0) return

  // Step 3: Extract learnings
  const extraction = await extractLearnings(query, results, priorLearnings, config)
  state.learnings.push(...extraction.learnings)
  // Estimate tokens for extraction based on results content
  const contentLength = results.reduce((sum, r) => sum + r.content.length, 0)
  state.tokenUsage += estimateTokens(JSON.stringify(extraction)) + Math.ceil(contentLength / 4)
  addProgress(state, 'extract', `Extracted ${extraction.learnings.length} learnings, ${extraction.followUpQuestions.length} follow-ups`)
  onProgress?.(state)

  // Step 4: Recurse deeper
  if (depth > 0 && extraction.followUpQuestions.length > 0) {
    const allLearnings = [...priorLearnings, ...extraction.learnings]
    const nextBreadth = Math.max(1, Math.floor(breadth / 2))
    const branches = extraction.followUpQuestions.slice(0, breadth)

    // Serialize branches to prevent concurrent state mutation
    for (const subQuery of branches) {
      // Re-check budget before each branch
      if (state.tokenUsage >= config.tokenBudget || state.totalSearches >= config.maxSearches) break
      await researchRecursive(subQuery, nextBreadth, depth - 1, allLearnings, state, config, onProgress)
    }
  }
}

function addProgress(state: ResearchState, action: ResearchState['progress'][0]['action'], detail: string) {
  state.progress.push({
    step: state.progress.length + 1,
    action,
    detail,
    timestamp: Date.now(),
  })
}
