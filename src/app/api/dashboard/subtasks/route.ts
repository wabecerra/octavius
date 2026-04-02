import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { nanoid } from 'nanoid'

interface SubtaskRow {
  id: string
  parent_task_id: string
  title: string
  description: string
  status: string
  step_order: number
  agent_id: string | null
  requires_approval: number
  approved_at: string | null
  output: string
  created_at: string
  updated_at: string
}

/** GET /api/dashboard/subtasks?taskId=xxx — list subtasks for a parent task */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  const db = getDatabase()
  const rows = db.prepare(
    'SELECT * FROM subtasks WHERE parent_task_id = ? ORDER BY step_order ASC'
  ).all(taskId) as SubtaskRow[]

  return NextResponse.json({
    subtasks: rows.map(r => ({
      id: r.id,
      parentTaskId: r.parent_task_id,
      title: r.title,
      description: r.description,
      status: r.status,
      stepOrder: r.step_order,
      agentId: r.agent_id,
      requiresApproval: r.requires_approval === 1,
      approvedAt: r.approved_at,
      output: r.output,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  })
}

/** POST /api/dashboard/subtasks — create subtasks (batch) */
export async function POST(request: Request) {
  const body = await request.json()
  const { parentTaskId, subtasks } = body as {
    parentTaskId: string
    subtasks: Array<{
      title: string
      description?: string
      agentId?: string
      requiresApproval?: boolean
    }>
  }

  if (!parentTaskId || !subtasks?.length) {
    return NextResponse.json({ error: 'parentTaskId and subtasks[] required' }, { status: 400 })
  }

  const db = getDatabase()
  const now = new Date().toISOString()

  const insert = db.prepare(`
    INSERT INTO subtasks (id, parent_task_id, title, description, status, step_order, agent_id, requires_approval, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `)

  const created = subtasks.map((s, i) => {
    const id = nanoid()
    insert.run(id, parentTaskId, s.title, s.description || '', i, s.agentId || null, s.requiresApproval ? 1 : 0, now, now)
    return { id, title: s.title, stepOrder: i, status: 'pending', requiresApproval: s.requiresApproval ?? false }
  })

  return NextResponse.json({ created })
}

/** PATCH /api/dashboard/subtasks — update a subtask (approve, complete, etc.) */
export async function PATCH(request: Request) {
  const body = await request.json()
  const { subtaskId, action } = body as {
    subtaskId: string
    action: 'approve' | 'complete' | 'fail' | 'skip' | 'dispatch'
    output?: string
  }

  if (!subtaskId || !action) {
    return NextResponse.json({ error: 'subtaskId and action required' }, { status: 400 })
  }

  const db = getDatabase()
  const now = new Date().toISOString()
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId) as SubtaskRow | undefined

  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 })
  }

  switch (action) {
    case 'approve':
      db.prepare('UPDATE subtasks SET approved_at = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(now, 'approved', now, subtaskId)

      // Log activity on parent task
      db.prepare(
        'INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)'
      ).run(subtask.parent_task_id, 'user', 'subtask_approved', `Approved: ${subtask.title}`, now)

      // Trigger execution of the next pending coder subtask (fire-and-forget)
      dispatchNextPendingSubtask(db, subtask.parent_task_id).catch(err =>
        console.error(`[subtasks] Failed to dispatch next subtask after approval:`, err)
      )

      return NextResponse.json({ ok: true, subtaskId, status: 'approved' })

    case 'complete':
      db.prepare('UPDATE subtasks SET status = ?, output = ?, updated_at = ? WHERE id = ?')
        .run('completed', body.output || '', now, subtaskId)

      // Check if all subtasks are complete
      const remaining = db.prepare(
        "SELECT COUNT(*) as count FROM subtasks WHERE parent_task_id = ? AND status NOT IN ('completed', 'skipped')"
      ).get(subtask.parent_task_id) as { count: number }

      if (remaining.count === 0) {
        // All subtasks done — mark parent task as done
        db.prepare('UPDATE dashboard_tasks SET status = ?, completed = 1, updated_at = ? WHERE id = ?')
          .run('done', now, subtask.parent_task_id)
        db.prepare(
          'INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)'
        ).run(subtask.parent_task_id, 'system', 'completed', 'All subtasks completed', now)
      }

      return NextResponse.json({ ok: true, subtaskId, status: 'completed', allDone: remaining.count === 0 })

    case 'fail':
      db.prepare('UPDATE subtasks SET status = ?, output = ?, updated_at = ? WHERE id = ?')
        .run('failed', body.output || '', now, subtaskId)
      return NextResponse.json({ ok: true, subtaskId, status: 'failed' })

    case 'skip':
      db.prepare('UPDATE subtasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('skipped', now, subtaskId)
      return NextResponse.json({ ok: true, subtaskId, status: 'skipped' })

    case 'dispatch':
      // Manually dispatch a pending subtask (retry for stuck tasks)
      if (subtask.status !== 'pending') {
        return NextResponse.json({ error: `Cannot dispatch subtask with status "${subtask.status}"` }, { status: 400 })
      }
      dispatchNextPendingSubtask(db, subtask.parent_task_id).catch(err =>
        console.error(`[subtasks] Manual dispatch failed:`, err)
      )
      return NextResponse.json({ ok: true, subtaskId, status: 'dispatching' })

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}

// ─── Post-Approval Execution ───

/**
 * After a subtask is approved, find the next pending coder subtask
 * and dispatch it via the agent dispatch API.
 */
async function dispatchNextPendingSubtask(
  db: ReturnType<typeof getDatabase>,
  parentTaskId: string,
): Promise<void> {
  const nextStep = db.prepare(
    `SELECT id, title, description, agent_id FROM subtasks
     WHERE parent_task_id = ? AND status = 'pending'
     ORDER BY step_order ASC LIMIT 1`
  ).get(parentTaskId) as { id: string; title: string; description: string; agent_id: string | null } | undefined

  if (!nextStep) {
    console.log(`[subtasks] No pending subtasks to dispatch for task ${parentTaskId}`)
    return
  }

  const now = new Date().toISOString()

  // Mark the subtask as in-progress
  db.prepare('UPDATE subtasks SET status = ?, updated_at = ? WHERE id = ?')
    .run('in-progress', now, nextStep.id)

  // Get the approved spec (first subtask output) for context
  const specSubtask = db.prepare(
    `SELECT description FROM subtasks
     WHERE parent_task_id = ? AND status = 'approved' AND requires_approval = 1
     ORDER BY step_order ASC LIMIT 1`
  ).get(parentTaskId) as { description: string } | undefined

  const instruction = [
    `Execute this implementation step: ${nextStep.title}`,
    '',
    '## Step Details',
    nextStep.description,
    specSubtask ? `\n## Approved Architecture Spec\n${specSubtask.description.slice(0, 4000)}` : '',
  ].join('\n')

  const port = process.env.PORT ?? '3000'

  try {
    const res = await fetch(`http://localhost:${port}/api/agents/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: parentTaskId,
        agentId: nextStep.agent_id || 'specialist-coder',
        instruction,
      }),
    })

    if (!res.ok) {
      throw new Error(`Dispatch returned ${res.status}`)
    }

    db.prepare(
      'INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(parentTaskId, nextStep.agent_id || 'specialist-coder', 'subtask_dispatched', `Dispatched: ${nextStep.title} (subtask ${nextStep.id})`, now)

    console.log(`[subtasks] Dispatched coder for subtask "${nextStep.title}" on task ${parentTaskId}`)
  } catch (err) {
    // Revert to pending on failure so it can be retried
    db.prepare('UPDATE subtasks SET status = ?, updated_at = ? WHERE id = ?')
      .run('pending', now, nextStep.id)

    db.prepare(
      'INSERT INTO task_activity_log (task_id, agent_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run(parentTaskId, nextStep.agent_id || 'specialist-coder', 'dispatch_failed', `Failed to dispatch: ${nextStep.title} — ${(err as Error).message}`, now)

    throw err
  }
}
