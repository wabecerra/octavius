import { describe, it, expect, vi } from 'vitest'
import { executeTask, AgentExecutionError } from './agent-adapter'
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
    id: 'task-1',
    agentId: 'agent-1',
    description: 'Summarize the report',
    complexityScore: 3,
    tier: 1,
    modelUsed: 'llama3.2',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch
}

function mockFetchFail(status = 500): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Internal Server Error',
    json: () => Promise.resolve({}),
  }) as unknown as typeof fetch
}

describe('executeTask — local Ollama dispatch', () => {
  it('calls /api/generate for tier 1 local tasks', async () => {
    const fetchFn = mockFetchOk({ response: 'Summary done' })
    const task = makeTask({ complexityScore: 2 })

    const result = await executeTask(task, baseConfig, true, fetchFn)

    expect(result.result).toBe('Summary done')
    expect(result.routing.isLocal).toBe(true)
    expect(fetchFn).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'llama3.2', prompt: task.description }),
      }),
    )
  })
})

describe('executeTask — cloud dispatch', () => {
  it('calls /v1/chat/completions for tier 2 cloud tasks', async () => {
    const fetchFn = mockFetchOk({
      choices: [{ message: { content: 'Cloud result' } }],
    })
    const task = makeTask({ complexityScore: 6 })

    const result = await executeTask(task, baseConfig, false, fetchFn)

    expect(result.result).toBe('Cloud result')
    expect(result.routing.isLocal).toBe(false)
    expect(result.routing.tier).toBe(2)
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('falls back to cloud tier 1 when local is unreachable', async () => {
    const fetchFn = mockFetchOk({
      choices: [{ message: { content: 'Cloud tier 1' } }],
    })
    const task = makeTask({ complexityScore: 2 })

    const result = await executeTask(task, baseConfig, false, fetchFn)

    expect(result.routing.isLocal).toBe(false)
    expect(result.routing.tier).toBe(1)
    expect(result.routing.model).toBe('gemini-flash')
  })
})

describe('executeTask — retries with exponential backoff', () => {
  it('retries up to 3 times before failing', async () => {
    const fetchFn = mockFetchFail(500)
    const task = makeTask({ complexityScore: 2 })

    await expect(
      executeTask(task, baseConfig, true, fetchFn),
    ).rejects.toThrow(AgentExecutionError)

    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('succeeds on second attempt after first failure', async () => {
    let callCount = 0
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: 'Retry success' }),
      })
    }) as unknown as typeof fetch

    const task = makeTask({ complexityScore: 2 })
    const result = await executeTask(task, baseConfig, true, fetchFn)

    expect(result.result).toBe('Retry success')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})

describe('executeTask — escalation on 3 consecutive failures', () => {
  it('throws AgentExecutionError with escalation event after 3 failures', async () => {
    const fetchFn = mockFetchFail(503)
    const task = makeTask({ complexityScore: 3 })

    try {
      await executeTask(task, baseConfig, true, fetchFn)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentExecutionError)
      const execErr = err as AgentExecutionError
      expect(execErr.escalation.taskId).toBe('task-1')
      expect(execErr.escalation.fromTier).toBe(1)
      expect(execErr.escalation.toTier).toBe(2)
      expect(execErr.escalation.failureReason).toContain('503')
      expect(execErr.routing.tier).toBe(1)
    }
  })

  it('caps escalation at tier 3 for tier 3 tasks', async () => {
    const fetchFn = mockFetchFail(500)
    const task = makeTask({ complexityScore: 9 })

    try {
      await executeTask(task, baseConfig, false, fetchFn)
      expect.fail('Should have thrown')
    } catch (err) {
      const execErr = err as AgentExecutionError
      expect(execErr.escalation.fromTier).toBe(3)
      expect(execErr.escalation.toTier).toBe(3)
    }
  })
})

describe('executeTask — network errors', () => {
  it('handles fetch throwing an error (network failure)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(
      new Error('Network unreachable'),
    ) as unknown as typeof fetch
    const task = makeTask({ complexityScore: 2 })

    try {
      await executeTask(task, baseConfig, true, fetchFn)
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentExecutionError)
      const execErr = err as AgentExecutionError
      expect(execErr.escalation.failureReason).toBe('Network unreachable')
    }
  })
})

import fc from 'fast-check'
import { executeResearchTask } from './agents/research-agent'

describe('Property 19: Research Agent Search Invocation', () => {
  /**
   * **Validates: Requirements 14.2**
   *
   * For any Research Agent task with complexityScore >= 5, the execution path
   * includes at least one call to the search provider URL.
   */
  it('calls search provider for tasks with complexityScore >= 5', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 10 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        async (score, description) => {
          const calledUrls: string[] = []

          const mockFetch = vi.fn().mockImplementation((url: string) => {
            calledUrls.push(url)

            // Search provider
            if (url.includes('/v1/search')) {
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ results: [{ url: 'https://example.com' }] }),
              })
            }
            // Model endpoint (cloud)
            if (url.includes('/v1/chat/completions')) {
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ choices: [{ message: { content: 'result' } }] }),
              })
            }
            // Model endpoint (local)
            if (url.includes('/api/generate')) {
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ response: 'result' }),
              })
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`))
          }) as unknown as typeof fetch

          const task = makeTask({ complexityScore: score, description })

          await executeResearchTask(task, baseConfig, false, mockFetch)

          const searchUrl = `https://api.${baseConfig.researchProvider}.ai/v1/search`
          expect(calledUrls).toContain(searchUrl)
        },
      ),
      { numRuns: 150 },
    )
  })
})
