import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm-caller', () => ({
  callLLM: vi.fn(),
}))

import { classifyIntent, type IntentResult } from './intent-classifier'
import { callLLM } from '@/lib/llm-caller'

describe('classifyIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('returns create_task intent when LLM calls create_task tool', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: '',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      toolCalls: [{
        function: {
          name: 'create_task',
          arguments: JSON.stringify({
            title: 'Research AI impact on mental health',
            description: 'Comprehensive research on how AI affects mental health including therapeutic chatbots, social media risks, diagnostic tools, and ethical concerns.',
            quadrant: 'industry',
            priority: 'medium',
          }),
        },
      }],
    })

    const result = await classifyIntent('Research the impact of AI on mental health')

    expect(result.intent).toBe('create_task')
    expect(result.task).toBeDefined()
    expect(result.task!.title).toBe('Research AI impact on mental health')
    expect(result.task!.quadrant).toBe('industry')
  })

  it('returns respond intent when LLM calls respond tool', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: '',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      toolCalls: [{
        function: {
          name: 'respond',
          arguments: JSON.stringify({
            message: 'I can help you with that! Here are some tips for better sleep...',
          }),
        },
      }],
    })

    const result = await classifyIntent('How can I sleep better?')

    expect(result.intent).toBe('respond')
    expect(result.response).toBe('I can help you with that! Here are some tips for better sleep...')
  })

  it('falls back to respond intent when no tool calls returned', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: 'Here is my response without using tools.',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })

    const result = await classifyIntent('Tell me a joke')

    expect(result.intent).toBe('respond')
    expect(result.response).toBe('Here is my response without using tools.')
  })

  it('includes conversation history in context', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: 'Sure, continuing our conversation.',
      model: 'test',
      provider: 'test',
      costUsd: 0.001,
      usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
    })

    const history = [
      { role: 'user' as const, content: 'I want to improve my fitness' },
      { role: 'assistant' as const, content: 'Great! What aspects of fitness?' },
    ]

    await classifyIntent('Running and strength training', history)

    const callArgs = vi.mocked(callLLM).mock.calls[0]
    // System + history + current message
    expect(callArgs[0].length).toBe(4) // system + 2 history + 1 user
  })

  it('accepts optional model config', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce({
      text: 'Response.',
      model: 'custom-model',
      provider: 'custom',
      costUsd: 0.001,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })

    await classifyIntent('hello', undefined, { provider: 'custom', model: 'custom-model' })

    const callOpts = vi.mocked(callLLM).mock.calls[0][1]
    expect(callOpts.model).toBe('custom-model')
    expect(callOpts.provider).toBe('custom')
  })
})
