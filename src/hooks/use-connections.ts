'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface Connection {
  id: string; name: string; relationshipType: string
  lastContactDate: string; reminderFrequencyDays: number
}
interface ConnectionsResponse { connections: Connection[] }

export function useConnections() {
  const { data, loading, error, mutate, refetch } = useApi<ConnectionsResponse>('/api/dashboard/connections')

  const addConnection = useCallback(async (conn: { name: string; relationshipType: string; reminderFrequencyDays?: number }) => {
    const created = await apiCall<Connection>('/api/dashboard/connections', { method: 'POST', body: JSON.stringify(conn) })
    mutate(prev => prev ? { ...prev, connections: [...prev.connections, created] } : { connections: [created] })
    return created
  }, [mutate])

  const updateConnection = useCallback(async (id: string, updates: Partial<Connection>) => {
    await apiCall('/api/dashboard/connections', { method: 'PATCH', body: JSON.stringify({ id, ...updates }) })
    refetch()
  }, [refetch])

  return { connections: data?.connections ?? [], loading, error, refetch, addConnection, updateConnection }
}
