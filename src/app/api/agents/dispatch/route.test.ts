import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/gateway/server-client', () => ({
  getServerGatewayClient: vi.fn(),
}))
vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({
        id: 'task-1', title: 'Test task', description: 'Test',
        status: 'backlog', priority: 'medium', quadrant: 'industry',
      })),
      run: vi.fn(),
    })),
  })),
}))
vi.mock('@/lib/agent-spawner', () => ({
  spawnAgent: vi.fn(),
}))
vi.mock('@/lib/agents/output-sync', () => ({
  syncAgentOutput: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/llm-cost/tracker', () => ({
  logGatewayChat: vi.fn(),
}))

import { POST } from './route'

describe('POST /api/agents/dispatch', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('routes through gateway when connected', async () => {
    const { getServerGatewayClient } = await import('@/lib/gateway/server-client')
    const mockRequest = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ session_id: 'sess-123' }),
    })
    vi.mocked(getServerGatewayClient).mockResolvedValue({
      getStatus: () => 'connected',
      request: mockRequest,
    } as any)

    const req = new Request('http://localhost:3000/api/agents/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.source).toBe('gateway')
    expect(data.sessionId).toBe('sess-123')
    expect(mockRequest).toHaveBeenCalledWith(
      '/api/sessions/spawn',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('falls back to embedded spawner when gateway disconnected', async () => {
    const { getServerGatewayClient } = await import('@/lib/gateway/server-client')
    vi.mocked(getServerGatewayClient).mockResolvedValue(null)

    const { spawnAgent } = await import('@/lib/agent-spawner')
    vi.mocked(spawnAgent).mockResolvedValue({
      taskId: 'task-1', agentId: 'gen-industry', model: 'qwen/qwen3.5',
      provider: 'openrouter', output: 'Fallback output', action: 'completed',
      newStatus: 'done', costUsd: 0.001, kbContextUsed: false,
    })

    const req = new Request('http://localhost:3000/api/agents/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(data.source).toBe('embedded-fallback')
  })
})
