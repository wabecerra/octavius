import { describe, it, expect, vi } from 'vitest'
import { extractLearnings } from './extractor'
import type { ResearchConfig, SearchResult } from './types'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: JSON.stringify({
      learnings: [
        { fact: 'Calm has 100M downloads', confidence: 0.9, topic: 'market size' },
        { fact: 'Headspace targets corporate wellness', confidence: 0.8, topic: 'positioning' },
      ],
      followUpQuestions: ['What is Woebot clinical validation?'],
    }),
    model: 'test', provider: 'test', costUsd: 0,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }),
}))

describe('extractLearnings', () => {
  const config: ResearchConfig = { maxDepth: 3, maxBreadth: 4, tokenBudget: 500000, maxSearches: 50, model: 'test', searchProvider: 'kimi' }
  const results: SearchResult[] = [
    { url: 'https://calm.com', title: 'Calm App', content: 'Calm has 100M downloads...', snippet: '' },
  ]

  it('extracts learnings and follow-up questions from search results', async () => {
    const extraction = await extractLearnings('anxiety apps', results, [], config)

    expect(extraction.learnings).toHaveLength(2)
    expect(extraction.learnings[0].fact).toContain('Calm')
    expect(extraction.learnings[0].source).toBe('https://calm.com')
    expect(extraction.followUpQuestions).toHaveLength(1)
  })
})
