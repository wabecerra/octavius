import { describe, it, expect, vi, beforeEach } from 'vitest'

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
vi.mock('@/lib/gateway/bridge', () => ({
  getGatewayBridge: vi.fn(),
}))
vi.mock('@/lib/gateway/env-bootstrap', () => ({
  buildEnvironmentSnapshot: vi.fn(() => ({})),
  formatSnapshotForPrompt: vi.fn(() => '## Env Snapshot'),
}))
vi.mock('@/lib/gateway/context-cache', () => ({
  getContextCache: vi.fn(() => ({
    getOrCompute: vi.fn((_key: string, _ttl: number, compute: () => string) => ({
      content: compute(),
      cached: false,
    })),
  })),
  CACHE_TTL: { ENVIRONMENT_SNAPSHOT: 30000 },
}))
vi.mock('@/lib/harness/session-manager', () => ({
  getOrCreateHarnessSession: vi.fn(() => ({
    sessionKey: 'subagent:gen-industry',
    agentId: 'gen-industry',
    agentType: 'generalist',
    permissionLevel: 1,
    toolScope: [],
    tokenBudget: 100000,
    tokenUsed: 0,
    compactionCount: 0,
    createdAt: new Date().toISOString(),
  })),
  removeHarnessSession: vi.fn(),
}))

import { POST } from './route'

describe('POST /api/agents/dispatch', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('routes through gateway when bridge connected', async () => {
    const { getGatewayBridge } = await import('@/lib/gateway/bridge')
    const mockBridge = {
      status: 'CONNECTED',
      sendAgent: vi.fn().mockResolvedValue({
        payload: { summary: 'Task completed', sessionId: 'sess-123' },
      }),
      getFleetSnapshot: vi.fn(() => []),
    }
    vi.mocked(getGatewayBridge).mockReturnValue(mockBridge as any)

    const req = new Request('http://localhost:3000/api/agents/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-1' }),
    })

    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.source).toBe('gateway')
    expect(mockBridge.sendAgent).toHaveBeenCalled()
  })

  it('falls back to embedded spawner when bridge not connected', async () => {
    const { getGatewayBridge } = await import('@/lib/gateway/bridge')
    vi.mocked(getGatewayBridge).mockReturnValue({
      status: 'DISCONNECTED',
    } as any)

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
