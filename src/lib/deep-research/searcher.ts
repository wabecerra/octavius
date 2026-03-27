import { getProviderKey } from '@/lib/provider-keys'
import type { SearchResult, ResearchConfig } from './types'

export async function executeSearches(
  queries: string[],
  visitedUrls: string[],
  config: ResearchConfig,
): Promise<SearchResult[]> {
  const visited = new Set(visitedUrls)
  const results: SearchResult[] = []
  const CONCURRENCY = 3

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(q => searchSingle(q, config)),
    )

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled' && settled.value) {
        for (const r of settled.value) {
          if (!visited.has(r.url)) {
            visited.add(r.url)
            results.push(r)
          }
        }
      }
    }
  }

  return results
}

async function searchSingle(
  query: string,
  config: ResearchConfig,
): Promise<SearchResult[]> {
  const searchUrl = `https://api.${config.searchProvider}.ai/v1/search`
  const apiKey = config.searchApiKey || getProviderKey(config.searchProvider)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(searchUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })

  if (!res.ok) return []

  const data = await res.json()
  return (data.results || []).map((r: { url: string; title?: string; snippet?: string; content?: string }) => ({
    url: r.url,
    title: r.title || '',
    content: r.content || r.snippet || '',
    snippet: r.snippet || '',
  }))
}
