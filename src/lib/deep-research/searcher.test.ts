import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeSearches } from './searcher'
import type { ResearchConfig } from './types'

describe('executeSearches', () => {
  const config: ResearchConfig = {
    maxDepth: 3, maxBreadth: 4, tokenBudget: 500_000,
    maxSearches: 50, model: 'test', searchProvider: 'kimi',
  }

  beforeEach(() => { vi.restoreAllMocks() })

  it('returns parsed search results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { url: 'https://example.com/1', title: 'Result 1', snippet: 'Snippet 1' },
          { url: 'https://example.com/2', title: 'Result 2', snippet: 'Snippet 2' },
        ],
      })),
    )

    const results = await executeSearches(['test query'], [], config)
    expect(results).toHaveLength(2)
    expect(results[0].url).toBe('https://example.com/1')
  })

  it('deduplicates URLs already visited', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { url: 'https://already-seen.com', title: 'Old', snippet: '' },
          { url: 'https://new.com', title: 'New', snippet: '' },
        ],
      })),
    )

    const results = await executeSearches(['query'], ['https://already-seen.com'], config)
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://new.com')
  })

  it('handles fetch failures gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const results = await executeSearches(['query'], [], config)
    expect(results).toHaveLength(0)
  })
})
