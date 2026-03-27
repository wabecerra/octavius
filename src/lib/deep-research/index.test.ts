import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn()
    // Planner call
    .mockResolvedValueOnce({
      text: JSON.stringify({ queries: ['query 1', 'query 2'] }),
      model: 'test', provider: 'test', costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })
    // Extractor call
    .mockResolvedValueOnce({
      text: JSON.stringify({
        learnings: [
          { fact: 'Finding 1', confidence: 0.9, topic: 'topic-a' },
          { fact: 'Finding 2', confidence: 0.8, topic: 'topic-a' },
          { fact: 'Finding 3', confidence: 0.7, topic: 'topic-b' },
          { fact: 'Finding 4', confidence: 0.9, topic: 'topic-b' },
          { fact: 'Finding 5', confidence: 0.8, topic: 'topic-c' },
        ],
        followUpQuestions: [],
      }),
      model: 'test', provider: 'test', costUsd: 0.001,
      usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
    })
    // Evaluator call — sufficient
    .mockResolvedValueOnce({
      text: JSON.stringify({ sufficient: true, reason: 'Enough data', newGaps: [] }),
      model: 'test', provider: 'test', costUsd: 0,
      usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
    })
    // Synthesizer call
    .mockResolvedValueOnce({
      text: '# Research Report\n\n## Executive Summary\n\nFindings...',
      model: 'test', provider: 'test', costUsd: 0.01,
      usage: { prompt_tokens: 500, completion_tokens: 1000, total_tokens: 1500 },
    }),
}))

// Mock searcher to avoid real HTTP calls
vi.mock('./searcher', () => ({
  executeSearches: vi.fn().mockResolvedValue([
    { url: 'https://example.com/1', title: 'Result 1', content: 'Content 1', snippet: '' },
    { url: 'https://example.com/2', title: 'Result 2', content: 'Content 2', snippet: '' },
  ]),
}))

import { deepResearch } from './index'

describe('deepResearch', () => {
  it('runs the full loop and produces a report', async () => {
    const progressUpdates: string[] = []

    const state = await deepResearch(
      'What is the anxiety app market?',
      { maxDepth: 1, maxBreadth: 2, tokenBudget: 500_000, maxSearches: 10, model: 'test', searchProvider: 'kimi' },
      (s) => progressUpdates.push(s.status),
    )

    expect(state.status).toBe('complete')
    expect(state.report).toContain('Research Report')
    expect(state.learnings.length).toBeGreaterThan(0)
    expect(state.totalSearches).toBeGreaterThan(0)
    expect(progressUpdates).toContain('researching')
    expect(progressUpdates).toContain('complete')
  })
})
