import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRun = vi.fn()
const mockPrepare = vi.fn(() => ({ run: mockRun }))
vi.mock('@/lib/memory/db', () => ({
  getDatabase: () => ({ prepare: mockPrepare }),
}))

describe('dashboard-memory-bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('journalToMemory creates episodic memory from journal entry', async () => {
    const { journalToMemory } = await import('./dashboard-memory-bridge')

    journalToMemory({
      id: 'j-001',
      text: 'Today I felt grateful for the sunshine.',
      timestamp: '2026-03-25T10:00:00Z',
    })

    expect(mockPrepare).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
    const args = mockRun.mock.calls[0]
    // The text should be the journal content
    expect(args[1]).toContain('Today I felt grateful')
    // Type should be episodic
    expect(args[2]).toBe('episodic')
  })

  it('checkinToMemory creates episodic memory from check-in', async () => {
    const { checkinToMemory } = await import('./dashboard-memory-bridge')

    checkinToMemory({
      id: 'c-001',
      mood: 4,
      energy: 3,
      stress: 2,
      timestamp: '2026-03-25T10:00:00Z',
    })

    expect(mockRun).toHaveBeenCalled()
    const args = mockRun.mock.calls[0]
    expect(args[1]).toContain('mood 4/5')
    expect(args[1]).toContain('energy 3/5')
    expect(args[1]).toContain('stress 2/5')
  })

  it('taskCompletionToMemory creates episodic memory from completed task', async () => {
    const { taskCompletionToMemory } = await import('./dashboard-memory-bridge')

    taskCompletionToMemory({
      id: 't-001',
      title: 'Complete project proposal',
      quadrant: 'industry',
      status: 'done',
    })

    expect(mockRun).toHaveBeenCalled()
    const args = mockRun.mock.calls[0]
    expect(args[1]).toContain('Completed task: Complete project proposal')
  })

  it('taskCompletionToMemory skips non-done tasks', async () => {
    const { taskCompletionToMemory } = await import('./dashboard-memory-bridge')

    taskCompletionToMemory({
      id: 't-002',
      title: 'In progress task',
      status: 'in-progress',
    })

    expect(mockRun).not.toHaveBeenCalled()
  })

  it('does not throw when DB write fails', async () => {
    mockRun.mockImplementationOnce(() => {
      throw new Error('DB write error')
    })

    const { journalToMemory } = await import('./dashboard-memory-bridge')

    // Should not throw
    expect(() => {
      journalToMemory({
        id: 'j-003',
        text: 'Test entry',
        timestamp: '2026-03-25T10:00:00Z',
      })
    }).not.toThrow()
  })
})
