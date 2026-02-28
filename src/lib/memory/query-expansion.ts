import type { MemoryConfig } from './models'

/**
 * Query Expansion — generates alternative phrasings of a search query
 * using the configured model router. Inspired by QMD's fine-tuned
 * query expansion model, but uses the existing Ollama/cloud endpoint.
 *
 * Returns the original query + up to 2 expanded variants.
 * Falls back to [originalQuery] on any failure.
 */
export async function expandQuery(
  originalQuery: string,
  config: MemoryConfig,
): Promise<string[]> {
  if (!config.embedding_enabled) return [originalQuery]

  const prompt = [
    'Generate 2 alternative search queries for the following query.',
    'Each alternative should capture the same intent but use different words.',
    'Return ONLY the 2 alternatives, one per line, no numbering or explanation.',
    '',
    `Query: ${originalQuery}`,
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
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) return [originalQuery]

    const data = (await response.json()) as { response?: string }
    if (!data.response) return [originalQuery]

    const lines = data.response
      .split('\n')
      .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((l) => l.length > 3 && l.length < 500)
      .slice(0, 2)

    return [originalQuery, ...lines]
  } catch {
    return [originalQuery]
  }
}

/**
 * Expand a query and run a search function against each variant,
 * returning all result lists for RRF fusion.
 *
 * The original query's results are included twice (2x weight, matching QMD).
 */
export async function expandAndSearch<T>(
  originalQuery: string,
  config: MemoryConfig,
  searchFn: (query: string) => Promise<T[]> | T[],
): Promise<T[][]> {
  const queries = await expandQuery(originalQuery, config)
  const results: T[][] = []

  for (const q of queries) {
    const r = await searchFn(q)
    results.push(r)
    // Original query gets 2x weight — add its results twice
    if (q === originalQuery) results.push(r)
  }

  return results
}
