import { NextResponse } from 'next/server'
import { spawnAgent } from '@/lib/agent-spawner'

/**
 * POST /api/agents/dispatch — Dispatch a task to a generalist agent.
 *
 * Now uses the full agent spawner which provides:
 * - Agent workspace files as context
 * - KB context retrieval per quadrant
 * - Tool descriptions for KB interaction
 *
 * Body: { taskId: string, agentId?: string, instruction?: string }
 */
export async function POST(request: Request) {
  const body = await request.json()
  const { taskId, agentId, instruction } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  try {
    const result = await spawnAgent({ taskId, agentId, instruction })
    return NextResponse.json(result)
  } catch (err) {
    console.error(`[dispatch] Agent spawn failed:`, err)
    return NextResponse.json(
      { error: `Agent dispatch failed: ${err}`, taskId, agentId },
      { status: 500 },
    )
  }
}
