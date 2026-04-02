import { getGatewayBridge } from '@/lib/gateway/bridge'
import type { AgentEvent } from '@/lib/gateway/bridge-events'
import { buildEnvironmentSnapshot } from '@/lib/gateway/env-bootstrap'
import { getPendingConfirmations, cleanExpired } from '@/lib/gateway/confirmation-gate'
import { getPendingElevations, cleanExpiredElevations } from '@/lib/harness/permissions'
import { getActiveSessions } from '@/lib/harness/session-manager'

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

      // Push environment snapshot
      const envSnapshot = buildEnvironmentSnapshot(bridge)
      send('env.snapshot', envSnapshot)

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
          // Clean expired confirmations/elevations and send pending ones
          cleanExpired()
          cleanExpiredElevations()
          const pending = getPendingConfirmations()
          if (pending.length > 0) {
            send('confirmations.pending', pending)
          }
          const elevations = getPendingElevations()
          if (elevations.length > 0) {
            send('permission.elevation_needed', elevations)
          }
          // Send active harness sessions for UI status
          const sessions = getActiveSessions()
          if (sessions.length > 0) {
            send('harness.sessions', sessions.map(s => ({
              sessionKey: s.sessionKey,
              agentId: s.agentId,
              agentType: s.agentType,
              permissionLevel: s.permissionLevel,
              tokenUsed: s.tokenUsed,
              tokenBudget: s.tokenBudget,
            })))
          }
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
