'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { getFleetStore, type FleetSnapshot } from './fleet-store'

/**
 * Hook to read the fleet store with automatic re-renders on change.
 * State persists across tab switches via sessionStorage.
 */
export function useFleet(): FleetSnapshot {
  const store = getFleetStore()
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  )
}

/**
 * Hook to fetch and sync agent model configs from the API into the fleet store.
 * Call once at the top level.
 */
export function useFleetConfigSync() {
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (synced) return
    const store = getFleetStore()
    fetch('/api/agents/config')
      .then(r => r.json())
      .then(data => {
        if (data.configs) {
          for (const cfg of data.configs as Array<{ agentId: string; model: string }>) {
            store.updateAgentModel(cfg.agentId, cfg.model)
          }
        }
        setSynced(true)
      })
      .catch(() => setSynced(true))
  }, [synced])
}

/**
 * Hook that polls the task_activity_log API and syncs backend agent activity
 * into the fleet store. This bridges externally-dispatched agents (via chat,
 * OpenClaw CLI, or direct API) with the Nerve Center UI.
 *
 * Polls every 10 seconds and hydrates agents + activity feed.
 */
export function useFleetActivitySync() {
  const lastSeenRef = useRef<string | null>(null)

  useEffect(() => {
    const store = getFleetStore()

    const sync = async () => {
      try {
        const res = await fetch('/api/dashboard/tasks/activity?limit=20')
        if (!res.ok) return
        const data = await res.json()
        const activities = data.activities as Array<{
          id: number
          taskId: string
          agentId: string
          action: string
          details: string
          model: string | null
          costUsd: number
          timestamp: string
        }>

        if (activities.length === 0) return

        // Skip if we've already processed this batch
        const latestId = String(activities[0].id)
        if (latestId === lastSeenRef.current) return
        lastSeenRef.current = latestId

        // Build a map of the most recent activity per agent
        const agentLatest = new Map<string, typeof activities[0]>()
        for (const act of activities) {
          if (!agentLatest.has(act.agentId)) {
            agentLatest.set(act.agentId, act)
          }
        }

        // Check which agents have recent activity (last 5 minutes = likely still running)
        const fiveMinAgo = Date.now() - 5 * 60 * 1000
        const snapshot = store.getSnapshot()

        for (const [agentId, latest] of agentLatest) {
          const agent = snapshot.agents.find(a => a.id === agentId)
          if (!agent) continue

          const actTime = new Date(latest.timestamp).getTime()

          if (latest.action === 'started' || latest.action === 'progressed' || latest.action === 'subtask_dispatched') {
            // Agent was recently active — mark as running if currently idle
            if (actTime > fiveMinAgo && agent.status === 'empty') {
              store.assignTask(agentId, latest.taskId, latest.details?.slice(0, 60) || 'Working...')
            }
          } else if (latest.action === 'completed') {
            // Agent completed — mark done if it was running
            if (agent.status === 'running' && agent.currentTaskId === latest.taskId) {
              store.completeTask(agentId)
            }
          } else if (latest.action === 'spawn_failed' || latest.action === 'dispatch_failed') {
            if (agent.status === 'running') {
              store.failTask(agentId)
            }
          }
        }

        // Also push new activity entries into the feed
        const existingIds = new Set(snapshot.activity.map(a => a.id))
        for (const act of activities.slice(0, 5)) {
          const feedId = `backend-${act.id}`
          if (existingIds.has(feedId)) continue
          if (new Date(act.timestamp).getTime() < fiveMinAgo) continue

          const agent = snapshot.agents.find(a => a.id === act.agentId)
          const actionLabel = act.action === 'started' ? 'Started' :
            act.action === 'progressed' ? 'Progress' :
            act.action === 'completed' ? 'Completed' :
            act.action === 'spawn_requested' ? 'Spawning specialist' :
            act.action === 'subtask_dispatched' ? 'Dispatched' :
            act.action === 'subtask_approved' ? 'Approved' :
            act.action === 'dispatch_failed' ? 'Dispatch failed' :
            act.action
          store.addBackendActivity(
            feedId,
            act.agentId,
            agent?.emoji ?? '🤖',
            `${actionLabel}: ${(act.details || '').slice(0, 80)}`,
            act.action === 'completed' ? 'complete' : act.action === 'spawn_failed' ? 'fail' : 'dispatch',
            act.timestamp,
          )
        }
      } catch {
        // Non-fatal — will retry next poll
      }
    }

    sync()
    const iv = setInterval(sync, 10_000)
    return () => clearInterval(iv)
  }, [])
}

// Re-export SSE hook for convenience
export { useFleetSSE } from './use-fleet-sse'
