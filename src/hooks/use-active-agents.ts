'use client'

import { useApi } from './use-api'

export interface ActiveAgent {
  taskId: string
  agentId: string
  action: string
  taskTitle: string
  taskStatus: string
  lastActivity: string
  model: string | null
  costUsd: number
}

export interface PendingSpecialist {
  taskId: string
  requestedBy: string
  details: string
  requestedAt: string
}

interface ActiveAgentsResponse {
  activeAgents: ActiveAgent[]
  pendingSpecialists: PendingSpecialist[]
}

/**
 * Polls /api/agents/active every 10s to track which agents are working.
 * Returns a Set of taskIds with active agents for quick lookup.
 */
export function useActiveAgents() {
  const { data, loading, error } = useApi<ActiveAgentsResponse>(
    '/api/agents/active',
    { refreshInterval: 10_000 },
  )

  const activeTaskIds = new Set(
    (data?.activeAgents ?? []).map(a => a.taskId),
  )

  const agentByTaskId = new Map(
    (data?.activeAgents ?? []).map(a => [a.taskId, a]),
  )

  return {
    activeAgents: data?.activeAgents ?? [],
    pendingSpecialists: data?.pendingSpecialists ?? [],
    activeTaskIds,
    agentByTaskId,
    loading,
    error,
  }
}
