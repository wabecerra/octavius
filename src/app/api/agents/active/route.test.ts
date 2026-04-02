import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database
const mockAll = vi.fn()
const mockPrepare = vi.fn(() => ({ all: mockAll }))
vi.mock('@/lib/memory/db', () => ({
  getDatabase: () => ({ prepare: mockPrepare }),
}))

describe('GET /api/agents/active', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return active agents and pending specialists', async () => {
    // First query: active agents
    mockAll.mockReturnValueOnce([
      {
        task_id: 'task-1',
        agent_id: 'gen-industry',
        action: 'started',
        details: 'Working on task',
        model: 'claude-sonnet',
        cost_usd: 0.01,
        timestamp: '2026-03-25T10:00:00Z',
        task_title: 'Research competitors',
        task_status: 'in-progress',
      },
    ])
    // Second query: pending specialists
    mockAll.mockReturnValueOnce([
      {
        task_id: 'task-1',
        agent_id: 'gen-industry',
        details: 'specialist-research: Research anxiety management SaaS',
        timestamp: '2026-03-25T10:01:00Z',
      },
    ])

    const { GET } = await import('./route')
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.activeAgents).toHaveLength(1)
    expect(data.activeAgents[0].taskId).toBe('task-1')
    expect(data.activeAgents[0].agentId).toBe('gen-industry')
    expect(data.pendingSpecialists).toHaveLength(1)
  })

  it('should return empty arrays when no active work', async () => {
    mockAll.mockReturnValueOnce([])
    mockAll.mockReturnValueOnce([])

    const { GET } = await import('./route')
    const response = await GET()
    const data = await response.json()

    expect(data.activeAgents).toEqual([])
    expect(data.pendingSpecialists).toEqual([])
  })
})
