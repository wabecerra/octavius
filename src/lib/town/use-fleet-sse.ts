'use client'

import { useEffect, useRef } from 'react'
import { getFleetStore } from './fleet-store'
import type { FleetAgentState } from '@/lib/gateway/bridge-events'

/**
 * Subscribe to SSE events from /api/events/stream and sync fleet state.
 * EventSource auto-reconnects on disconnect.
 * Polling fallback (useFleetActivitySync) still works independently.
 */
export function useFleetSSE() {
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const store = getFleetStore()
    const es = new EventSource('/api/events/stream')
    esRef.current = es

    // Initial fleet snapshot from server
    es.addEventListener('fleet.snapshot', (e: MessageEvent) => {
      try {
        const agents = JSON.parse(e.data) as FleetAgentState[]
        store.applyServerState(agents)
      } catch { /* ignore parse errors */ }
    })

    // Individual agent events update fleet state
    const agentEvents = [
      'agent.started', 'agent.streaming', 'agent.completed',
      'agent.failed', 'agent.spawned', 'agent.approval_needed',
    ]

    for (const eventType of agentEvents) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as { agentId?: string; type?: string }
          if (!event.agentId) return

          const statusMap: Record<string, FleetAgentState['status']> = {
            'agent.started': 'running',
            'agent.streaming': 'running',
            'agent.completed': 'done',
            'agent.failed': 'failed',
            'agent.spawned': 'running',
          }

          const newStatus = statusMap[eventType]
          if (newStatus) {
            store.applyServerState([{
              id: event.agentId,
              type: event.agentId.startsWith('specialist-') ? 'specialist' : 'generalist',
              status: newStatus,
            }])
          }
        } catch { /* ignore */ }
      })
    }

    es.onerror = () => {
      // EventSource auto-reconnects; polling fallback handles the gap
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [])
}
