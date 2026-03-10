import { NextResponse } from 'next/server'
import { spawnAgent } from '@/lib/agent-spawner'

/**
 * POST /api/agents/spawn — Spawn a real agent to work on a task.
 *
 * The agent receives:
 * - Its workspace files (AGENTS.md, TOOLS.md, etc.)
 * - Quadrant-relevant KB context from the memory service
 * - Task details and full history
 * - Tool descriptions for KB interaction and task updates
 *
 * Body: { taskId: string, agentId?: string, instruction?: string, maxTokens?: number }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { taskId, agentId, instruction, maxTokens } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  try {
    const result = await spawnAgent({ taskId, agentId, instruction, maxTokens })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[agents/spawn] Failed:', err)
    return NextResponse.json(
      { error: `Agent spawn failed: ${err}` },
      { status: 500 },
    )
  }
}
