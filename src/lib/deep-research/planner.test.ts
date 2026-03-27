import { describe, it, expect, vi } from 'vitest'
import { generateQueries } from './planner'
import type { ResearchConfig, Learning } from './types'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: JSON.stringify({ queries: ['query 1', 'query 2', 'query 3'] }),
    model: 'test', provider: 'test', costUsd: 0, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }),
}))

describe('generateQueries', () => {
  const config: ResearchConfig = { maxDepth: 3, maxBreadth: 4, tokenBudget: 500000, maxSearches: 50, model: 'test', searchProvider: 'kimi' }

  it('generates the requested number of queries', async () => {
    const queries = await generateQueries('What is the anxiety app market?', 3, [], config)
    expect(queries).toHaveLength(3)
    expect(queries[0]).toBe('query 1')
  })

  it('includes prior learnings in context', async () => {
    const { callLLM } = await import('@/lib/llm-caller')
    vi.mocked(callLLM).mockClear()
    const priorLearnings: Learning[] = [
      { fact: 'Calm has 100M downloads', source: 'https://calm.com', confidence: 0.9, topic: 'market size' },
    ]

    await generateQueries('anxiety apps', 3, priorLearnings, config)

    const call = vi.mocked(callLLM).mock.calls[0]
    const userMsg = call[0].find(m => m.role === 'user')
    expect(userMsg?.content).toContain('Calm has 100M downloads')
  })
})
