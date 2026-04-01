import { getGatewayBridge } from '@/lib/gateway/bridge'
import type { AgentEvent } from '@/lib/gateway/bridge-events'

export const dynamic = 'force-dynamic'

export async function GET() {
  const bridge = getGatewayBridge()

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Push current fleet state as initial snapshot
      const fleet = bridge.getFleetSnapshot()
      send('fleet.snapshot', fleet)

      // Push bridge status
      send('bridge.status', { status: bridge.status })

      // Subscribe to agent events
      function onAgentEvent(event: AgentEvent) {
        try {
          send(event.type, event)
        } catch {
          cleanup()
        }
      }
      bridge.on('agent-event', onAgentEvent)

      // Subscribe to status changes
      function onStatus(status: string) {
        try {
          send('bridge.status', { status })
        } catch {
          cleanup()
        }
      }
      bridge.on('status', onStatus)

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'))
        } catch {
          cleanup()
        }
      }, 30_000)

      function cleanup() {
        bridge.removeListener('agent-event', onAgentEvent)
        bridge.removeListener('status', onStatus)
        clearInterval(heartbeat)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
