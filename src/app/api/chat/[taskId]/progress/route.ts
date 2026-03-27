import { getDatabase } from '@/lib/memory/db'

/**
 * GET /api/chat/{taskId}/progress — SSE stream for real-time task activity
 *
 * Streams task_activity_log entries as Server-Sent Events so the chat panel
 * can show real-time agent progress. Polls every 500ms, closes on task completion
 * or after 60 seconds of inactivity.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params
  const encoder = new TextEncoder()
  let intervalId: ReturnType<typeof setInterval> | null = null

  // Clean up on client disconnect (belt-and-suspenders with cancel())
  request.signal.addEventListener('abort', () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  const stream = new ReadableStream({
    start(controller) {
      let lastSeenId = 0
      let idleCount = 0
      const MAX_IDLE = 120 // 60 seconds (120 * 500ms)

      intervalId = setInterval(() => {
        try {
          const db = getDatabase()
          const rows = db
            .prepare(
              `SELECT id, agent_id, action, details, model, cost_usd, timestamp
             FROM task_activity_log
             WHERE task_id = ? AND id > ?
             ORDER BY id ASC`,
            )
            .all(taskId, lastSeenId) as Array<{
            id: number
            agent_id: string
            action: string
            details: string
            model: string | null
            cost_usd: number
            timestamp: string
          }>

          if (rows.length > 0) {
            idleCount = 0
            for (const row of rows) {
              lastSeenId = row.id
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'activity',
                    agentId: row.agent_id,
                    action: row.action,
                    details: row.details,
                    model: row.model,
                    costUsd: row.cost_usd,
                    timestamp: row.timestamp,
                  })}\n\n`,
                ),
              )

              // If agent completed, send final event and close
              if (row.action === 'completed') {
                // Fetch the task to get final output
                const task = db
                  .prepare('SELECT status, description FROM dashboard_tasks WHERE id = ?')
                  .get(taskId) as { status: string; description: string } | undefined

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'complete',
                      taskStatus: task?.status || 'done',
                    })}\n\n`,
                  ),
                )

                if (intervalId) clearInterval(intervalId)
                controller.close()
                return
              }
            }
          } else {
            idleCount++
            if (idleCount >= MAX_IDLE) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'timeout',
                    detail: 'No activity for 60 seconds',
                  })}\n\n`,
                ),
              )
              if (intervalId) clearInterval(intervalId)
              controller.close()
            }
          }
        } catch (err) {
          // DB error — keep trying
          console.error('[Progress SSE] DB error:', err)
        }
      }, 500)
    },
    cancel() {
      if (intervalId) clearInterval(intervalId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
