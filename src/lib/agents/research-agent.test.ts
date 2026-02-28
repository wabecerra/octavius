import { describe, it, expect, vi } from 'vitest'
import { executeResearchTask } from './research-agent'
import type { AgentTask, ModelRouterConfig } from '@/types'

const baseConfig: ModelRouterConfig = {
  localEndpoint: 'http://localhost:11434',
  localModelName: 'llama3.2',
  tier1CloudModel: 'gemini-flash',
  tier2Model: 'claude-sonnet-4-5',
  tier3Model: 'claude-opus-4-5',
  researchProvider: 'kimi',
  dailyCostBudget: 5,
  tierCostRates: { 1: 0.01, 2: 0.05, 3: 0.15 },
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'research-1',
    agentId: 'specialist-research',
    description: 'Research quantum computing trends',
    complexityScore: 6,
    tier: 2,
    modelUsed: 'claude-sonnet-4-5',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Creates a fetch mock that handles both search and model endpoints.
 */
function createMockFetch(opts: {
  searchOk?: boolean
  searchUrls?: string[]
  modelResult?: string
}) {
  const {
    searchOk = true,
    searchUrls = ['https://example.com/1', 'https://example.com/2'],
    modelResult = 'Research complete',
  } = opts

  return vi.fn().mockImplementation((url: string) => {
    // Search provider call
    if (url.includes('/v1/search')) {
      if (!searchOk) {
        return Promise.resolve({ ok: false, status: 500, statusText: 'Error' })
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            results: searchUrls.map((u) => ({ url: u })),
          }),
      })
    }
    // Model endpoint call (cloud or local)
    if (url.includes('/v1/chat/completions')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: modelResult } }],
          }),
      })
    }
    if (url.includes('/api/generate')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: modelResult }),
      })
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  }) as unknown as typeof fetch
}

describe('executeResearchTask — search invocation for complex tasks', () => {
  it('calls search provider for tasks with complexityScore >= 5', async () => {
    const fetchFn = createMockFetch({ searchUrls: ['https://a.com', 'https://b.com'] })
    const task = makeTask({ complexityScore: 6 })

    const result = await executeResearchTask(task, baseConfig, false, fetchFn)

    expect(result.sourceUrls).toEqual(['https://a.com', 'https://b.com'])
    expect(result.isVerified).toBe(true)
    expect(result.result).toBe('Research complete')
    // Should have called search + model endpoint
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.kimi.ai/v1/search',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('calls search provider at exactly complexityScore 5', async () => {
    const fetchFn = createMockFetch({})
    const task = makeTask({ complexityScore: 5 })

    const result = await executeResearchTask(task, baseConfig, false, fetchFn)

    expect(result.sourceUrls.length).toBeGreaterThan(0)
    expect(result.isVerified).toBe(true)
  })

  it('skips search for tasks with complexityScore < 5', async () => {
    const fetchFn = createMockFetch({})
    const task = makeTask({ complexityScore: 3 })

    const result = await executeResearchTask(task, baseConfig, true, fetchFn)

    expect(result.sourceUrls).toEqual([])
    expect(result.isVerified).toBe(true)
    // Should NOT have called search endpoint
    const searchCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]: [string]) => url.includes('/v1/search'),
    )
    expect(searchCalls).toHaveLength(0)
  })
})

describe('executeResearchTask — search failure handling', () => {
  it('sets isVerified: false when search provider fails', async () => {
    const fetchFn = createMockFetch({ searchOk: false })
    const task = makeTask({ complexityScore: 7 })

    const result = await executeResearchTask(task, baseConfig, false, fetchFn)

    expect(result.isVerified).toBe(false)
    expect(result.sourceUrls).toEqual([])
    // Still returns model result
    expect(result.result).toBe('Research complete')
  })

  it('sets isVerified: false when search provider throws', async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/v1/search')) {
        return Promise.reject(new Error('Network error'))
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Fallback result' } }],
          }),
      })
    }) as unknown as typeof fetch

    const task = makeTask({ complexityScore: 8 })
    const result = await executeResearchTask(task, baseConfig, false, fetchFn)

    expect(result.isVerified).toBe(false)
    expect(result.sourceUrls).toEqual([])
    expect(result.result).toBe('Fallback result')
  })
})

describe('executeResearchTask — returns sourceUrls from search', () => {
  it('returns all URLs from search results', async () => {
    const urls = ['https://a.com', 'https://b.com', 'https://c.com']
    const fetchFn = createMockFetch({ searchUrls: urls })
    const task = makeTask({ complexityScore: 9 })

    const result = await executeResearchTask(task, baseConfig, false, fetchFn)

    expect(result.sourceUrls).toEqual(urls)
  })

  it('returns empty sourceUrls when search returns no results', async () => {
    const fetchFn = createMockFetch({ searchUrls: [] })
    const task = makeTask({ complexityScore: 5 })

    const result = await executeResearchTask(task, baseConfig, false, fetchFn)

    expect(result.sourceUrls).toEqual([])
    expect(result.isVerified).toBe(true)
  })
})
