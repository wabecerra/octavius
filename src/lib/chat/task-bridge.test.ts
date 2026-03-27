/**
 * Tests for task-bridge — task creation and agent dispatch without HTTP self-calls
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
    })),
  })),
}))

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-task-id') }))

vi.mock('@/lib/agent-spawner', () => ({
  spawnAgent: vi.fn(),
}))

vi.mock('@/lib/agents/output-sync', () => ({
  syncAgentOutput: vi.fn(() => Promise.resolve()),
}))

import { bridgeTaskToAgent } from './task-bridge'
import type { TaskIntent } from './intent-classifier'
import { spawnAgent } from '@/lib/agent-spawner'

describe('bridgeTaskToAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a task and dispatches it, returning tracking info', async () => {
    vi.mocked(spawnAgent).mockResolvedValueOnce({
      taskId: 'test-task-id',
      agentId: 'gen-industry',
      output: 'Research complete',
      action: 'completed',
      newStatus: 'done',
      model: 'test-model',
      provider: 'test',
      costUsd: 0.01,
      kbContextUsed: true,
    })

    const intent: TaskIntent = {
      title: 'Research AI mental health',
      description: 'Deep research on AI impact on mental health',
      quadrant: 'industry',
      priority: 'medium',
    }

    const result = await bridgeTaskToAgent(intent)

    expect(result.success).toBe(true)
    expect(result.taskId).toBe('test-task-id')
    expect(result.agentId).toBe('gen-industry')
    expect(result.dispatched).toBe(true)
    expect(result.message).toContain('Research AI mental health')

    // Verify spawnAgent was called with correct args
    expect(spawnAgent).toHaveBeenCalledWith({
      taskId: 'test-task-id',
      agentId: 'gen-industry',
    })
  })

  it('returns failure when DB insert throws', async () => {
    const { getDatabase } = await import('@/lib/memory/db')
    vi.mocked(getDatabase).mockReturnValueOnce({
      prepare: vi.fn(() => ({ run: vi.fn(() => { throw new Error('DB error') }) })),
    } as never)

    const intent: TaskIntent = {
      title: 'Test',
      description: 'Test',
      quadrant: 'industry',
      priority: 'medium',
    }

    const result = await bridgeTaskToAgent(intent)

    expect(result.success).toBe(false)
    expect(result.error).toContain('DB error')
  })

  it('returns partial success when dispatch fails but task was created', async () => {
    vi.mocked(spawnAgent).mockRejectedValueOnce(new Error('Agent spawn failed'))

    const intent: TaskIntent = {
      title: 'Test task',
      description: 'Some work',
      quadrant: 'industry',
      priority: 'low',
    }

    const result = await bridgeTaskToAgent(intent)

    expect(result.success).toBe(true)
    expect(result.taskId).toBe('test-task-id')
    expect(result.dispatched).toBe(false)
    expect(result.message).toContain('created')
  })
})
