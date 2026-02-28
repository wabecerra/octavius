import type Database from 'better-sqlite3'
import type { MemoryConfig, MemoryItem } from './models'
import { getCachedResult, setCachedResult } from './search-cache'

/**
 * LLM Re-ranking — scores each candidate memory's relevance to the query
 * using a lightweight LLM call. Inspired by QMD's Qwen3-reranker approach
 * but uses the existing Ollama endpoint.
 *
 * Returns items sorted by blended score (position-aware: RRF + reranker).
 */
export interface RerankResult {
  item: MemoryItem
  rerankScore: number
  fusionScore: number
  blendedScore: number
}

/**
 * Position-aware blending weights (from QMD):
 * - Rank 1-3:  75% retrieval / 25% reranker (preserve exact matches)
 * - Rank 4-10: 60% retrieval / 40% reranker
 * - Rank 11+:  40% retrieval / 60% reranker (trust reranker more)
 */
function blendScores(
  fusionScore: number,
  rerankScore: number,
  rank: number,
): number {
  let retrievalWeight: number
  if (rank <= 3) retrievalWeight = 0.75
  else if (rank <= 10) retrievalWeight = 0.60
  else retrievalWeight = 0.40

  return fusionScore * retrievalWeight + rerankScore * (1 - retrievalWeight)
}

/**
 * Score a single candidate against the query using the LLM.
 * Returns a relevance score 0.0-1.0.
 */
async function scoreCandidate(
  query: string,
  candidateText: string,
  config: MemoryConfig,
): Promise<number> {
  const prompt = [
    'Rate the relevance of the following text to the query on a scale of 0 to 10.',
    'Respond with ONLY a single number, nothing else.',
    '',
    `Query: ${query}`,
    `Text: ${candidateText.slice(0, 500)}`,
  ].join('\n')

  try {
    const response = await fetch(`${config.embedding_endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.embedding_model.replace('embed', 'llama3.2'),
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) return 0.5

    const data = (await response.json()) as { response?: string }
    if (!data.response) return 0.5

    const num = parseFloat(data.response.trim())
    if (isNaN(num)) return 0.5

    return Math.max(0, Math.min(1, num / 10))
  } catch {
    return 0.5 // neutral score on failure
  }
}

/**
 * Re-rank a list of candidate items against a query.
 *
 * 1. Scores each candidate via LLM (with caching)
 * 2. Applies position-aware blending between fusion scores and rerank scores
 * 3. Returns items sorted by blended score
 *
 * @param query - The original search query text
 * @param candidates - Items with their fusion scores, in fusion-rank order
 * @param config - Memory configuration (for LLM endpoint)
 * @param db - Database for caching rerank results
 * @param maxRerank - Max items to rerank (default 15, to limit LLM calls)
 */
export async function rerankResults(
  query: string,
  candidates: Array<{ item: MemoryItem; fusionScore: number }>,
  config: MemoryConfig,
  db: Database.Database,
  maxRerank = 15,
): Promise<RerankResult[]> {
  if (!config.embedding_enabled || candidates.length === 0) {
    // No reranking — return with fusionScore as blendedScore
    return candidates.map((c, i) => ({
      item: c.item,
      rerankScore: 0.5,
      fusionScore: c.fusionScore,
      blendedScore: c.fusionScore,
    }))
  }

  const toRerank = candidates.slice(0, maxRerank)
  const results: RerankResult[] = []

  // Score candidates (sequentially to avoid overwhelming the LLM)
  for (let i = 0; i < toRerank.length; i++) {
    const { item, fusionScore } = toRerank[i]
    const rank = i + 1

    // Check cache
    const cacheKey = `rerank:${query}:${item.memory_id}`
    const cachedScore = getCachedResult(db, cacheKey)
    let rerankScore: number

    if (cachedScore !== null && typeof cachedScore === 'number') {
      rerankScore = cachedScore
    } else {
      rerankScore = await scoreCandidate(query, item.text, config)
      setCachedResult(db, cacheKey, rerankScore)
    }

    const blendedScore = blendScores(fusionScore, rerankScore, rank)
    results.push({ item, rerankScore, fusionScore, blendedScore })
  }

  // Add remaining candidates (beyond maxRerank) with neutral rerank score
  for (let i = maxRerank; i < candidates.length; i++) {
    const { item, fusionScore } = candidates[i]
    results.push({
      item,
      rerankScore: 0.5,
      fusionScore,
      blendedScore: blendScores(fusionScore, 0.5, i + 1),
    })
  }

  // Sort by blended score descending
  results.sort((a, b) => b.blendedScore - a.blendedScore)
  return results
}
