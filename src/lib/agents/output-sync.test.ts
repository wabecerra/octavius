import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/memory/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })),
  })),
}))

import { syncAgentOutput } from './output-sync'

describe('syncAgentOutput', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates a memory item with correct provenance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ memory_id: 'mem-1' }), { status: 201 }),
    )

    await syncAgentOutput('task-1', 'gen-industry', '# Research Report\n\nKey findings about the industry sector that are important for planning.', 'industry')

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/memory/items'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('agent_output'),
      }),
    )

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string)
    expect(body.type).toBe('semantic')
    expect(body.provenance.source_type).toBe('agent_output')
    expect(body.provenance.agent_id).toBe('gen-industry')
    expect(body.tags).toContain('quadrant:industry')
    expect(body.tags).toContain('task:task-1')

    fetchSpy.mockRestore()
  })

  it('does not throw on failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    await expect(
      syncAgentOutput('task-1', 'gen-industry', 'output', 'industry'),
    ).resolves.not.toThrow()

    fetchSpy.mockRestore()
  })

  it('skips empty or very short output', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await syncAgentOutput('task-1', 'gen-industry', '', 'industry')
    await syncAgentOutput('task-1', 'gen-industry', 'ok', 'industry')

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
