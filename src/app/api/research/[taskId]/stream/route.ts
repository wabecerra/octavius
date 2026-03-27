import { researchTasks, scheduleCleanup } from '@/lib/deep-research/store'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId: researchId } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let lastProgressLength = 0
      let attempts = 0

      const interval = setInterval(() => {
        const state = researchTasks.get(researchId)
        if (!state) {
          attempts++
          if (attempts > 60) { // 30 seconds timeout
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', detail: 'Research task not found' })}\n\n`))
            clearInterval(interval)
            controller.close()
          }
          return
        }

        // Send new progress entries
        if (state.progress.length > lastProgressLength) {
          const newEntries = state.progress.slice(lastProgressLength)
          for (const entry of newEntries) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', ...entry })}\n\n`))
          }
          lastProgressLength = state.progress.length
        }

        // Send completion
        if (state.status === 'complete' || state.status === 'error') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: state.status === 'complete' ? 'complete' : 'error',
            report: state.report,
            error: state.error,
            stats: {
              totalSearches: state.totalSearches,
              totalLearnings: state.learnings.length,
              durationMs: (state.completedAt ?? Date.now()) - state.startedAt,
              visitedUrls: state.visitedUrls.length,
            },
          })}\n\n`))
          clearInterval(interval)
          controller.close()

          // Clean up after 5 minutes
          scheduleCleanup(researchId)
        }
      }, 500)
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
