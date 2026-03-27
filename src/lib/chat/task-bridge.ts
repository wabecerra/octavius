/**
 * Task Bridge — Creates dashboard tasks from classified intents and dispatches
 * to agents using direct DB/function calls (no self-fetch).
 *
 * Bridges the conversational interface to the agent dispatch system without
 * HTTP round-trips to avoid deadlock issues.
 */
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'
import { spawnAgent } from '@/lib/agent-spawner'
import { syncAgentOutput } from '@/lib/agents/output-sync'
import type { TaskIntent } from './intent-classifier'

export interface BridgeResult {
  success: boolean
  taskId?: string
  agentId?: string
  dispatched: boolean
  message: string
  error?: string
}

/**
 * Create a dashboard task from a classified intent and dispatch it to the
 * appropriate agent. Uses direct DB/function calls (no self-fetch).
 */
export async function bridgeTaskToAgent(intent: TaskIntent): Promise<BridgeResult> {
  const db = getDatabase()

  // Step 1: Create the dashboard task directly in DB
  const taskId = nanoid()
  const now = new Date().toISOString()
  try {
    db.prepare(
      `INSERT INTO dashboard_tasks (id, title, description, priority, status, quadrant, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'backlog', ?, 0, ?, ?)`
    ).run(taskId, intent.title.trim(), intent.description.trim(), intent.priority, intent.quadrant, now, now)
  } catch (err) {
    return {
      success: false,
      dispatched: false,
      message: 'Failed to create task — internal error',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // Step 2: Dispatch to the appropriate agent via spawnAgent (no HTTP round-trip)
  const agentId = `gen-${intent.quadrant}`
  try {
    const result = await spawnAgent({ taskId, agentId })

    // Sync output to knowledge base (fire-and-forget)
    syncAgentOutput(taskId, result.agentId, result.output, intent.quadrant).catch(() => {})

    return {
      success: true,
      taskId,
      agentId: result.agentId,
      dispatched: true,
      message: `On it! I've created "${intent.title}" and dispatched ${result.agentId} to work on it. You can track progress in the Nerve Center.`,
    }
  } catch {
    return {
      success: true,
      taskId,
      agentId,
      dispatched: false,
      message: `Task "${intent.title}" created but agent dispatch failed. It's in your backlog — you can dispatch it manually from the Kanban board.`,
    }
  }
}
