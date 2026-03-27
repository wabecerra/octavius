import { describe, it, expect, vi } from 'vitest'
import { evaluateCompleteness } from './evaluator'
import type { ResearchConfig, Learning } from './types'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: JSON.stringify({ sufficient: true, reason: 'Comprehensive data', newGaps: [] }),
    model: 'test', provider: 'test', costUsd: 0,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }),
}))

describe('evaluateCompleteness', () => {
  const config: ResearchConfig = {
    maxDepth: 3, maxBreadth: 4, tokenBudget: 500_000,
    maxSearches: 50, model: 'test', searchProvider: 'kimi',
  }

  it('returns insufficient when fewer than 5 learnings', async () => {
    const learnings: Learning[] = [
      { fact: 'Fact 1', source: 'url1', confidence: 0.9, topic: 'a' },
    ]
    const result = await evaluateCompleteness('question', learnings, [], 1000, config)
    expect(result.sufficient).toBe(false)
    expect(result.reason).toContain('Not enough')
  })

  it('returns sufficient when token budget nearly exhausted', async () => {
    const learnings: Learning[] = Array.from({ length: 10 }, (_, i) => ({
      fact: `Fact ${i}`, source: `url${i}`, confidence: 0.9, topic: 'a',
    }))
    const result = await evaluateCompleteness('question', learnings, [], 450_000, config)
    expect(result.sufficient).toBe(true)
    expect(result.reason).toContain('budget')
  })

  it('delegates to LLM when enough learnings and budget', async () => {
    const learnings: Learning[] = Array.from({ length: 10 }, (_, i) => ({
      fact: `Fact ${i}`, source: `url${i}`, confidence: 0.9, topic: 'a',
    }))
    const result = await evaluateCompleteness('question', learnings, [], 100_000, config)
    expect(result.sufficient).toBe(true)
  })
})
