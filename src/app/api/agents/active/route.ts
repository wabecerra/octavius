import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'

/**
 * GET /api/agents/active — Returns agents currently working on tasks.
 *
 * An agent is considered "active" if it has a task_activity_log entry with
 * action='started' or action='progressed' and the associated task is still
 * in-progress (not yet done). Also returns specialist spawn requests
 * that haven't completed yet.
 */
export async function GET() {
  const db = getDatabase()

  // Find tasks with recent agent activity that are still in-progress
  const activeAgents = db.prepare(`
    SELECT
      tal.task_id,
      tal.agent_id,
      tal.action,
      tal.details,
      tal.model,
      tal.cost_usd,
      tal.timestamp,
      dt.title AS task_title,
      dt.status AS task_status
    FROM task_activity_log tal
    JOIN dashboard_tasks dt ON dt.id = tal.task_id
    WHERE dt.status = 'in-progress'
      AND tal.id = (
        SELECT MAX(t2.id)
        FROM task_activity_log t2
        WHERE t2.task_id = tal.task_id
      )
    ORDER BY tal.timestamp DESC
    LIMIT 50
  `).all() as Array<{
    task_id: string
    agent_id: string
    action: string
    details: string
    model: string | null
    cost_usd: number
    timestamp: string
    task_title: string
    task_status: string
  }>

  // Also get any pending specialist spawns (spawn_requested but no follow-up from that specialist)
  const pendingSpecialists = db.prepare(`
    SELECT
      tal.task_id,
      tal.agent_id,
      tal.details,
      tal.timestamp
    FROM task_activity_log tal
    WHERE tal.action = 'spawn_requested'
      AND NOT EXISTS (
        SELECT 1 FROM task_activity_log t2
        WHERE t2.task_id = tal.task_id
          AND t2.agent_id != tal.agent_id
          AND t2.timestamp > tal.timestamp
          AND t2.action IN ('started', 'progressed', 'completed', 'spawn_failed')
      )
    ORDER BY tal.timestamp DESC
    LIMIT 20
  `).all() as Array<{
    task_id: string
    agent_id: string
    details: string
    timestamp: string
  }>

  return NextResponse.json({
    activeAgents: activeAgents.map(a => ({
      taskId: a.task_id,
      agentId: a.agent_id,
      action: a.action,
      taskTitle: a.task_title,
      taskStatus: a.task_status,
      lastActivity: a.timestamp,
      model: a.model,
      costUsd: a.cost_usd,
    })),
    pendingSpecialists: pendingSpecialists.map(s => ({
      taskId: s.task_id,
      requestedBy: s.agent_id,
      details: s.details,
      requestedAt: s.timestamp,
    })),
  })
}
