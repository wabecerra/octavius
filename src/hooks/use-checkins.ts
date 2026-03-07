'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface CheckIn {
  id: string
  timestamp: string
  mood: 1 | 2 | 3 | 4 | 5
  energy: 1 | 2 | 3 | 4 | 5
  stress: 1 | 2 | 3 | 4 | 5
}

interface CheckInsResponse { checkins: CheckIn[]; total: number }

export function useCheckins(since?: string) {
  const qs = new URLSearchParams({ limit: '100' })
  if (since) qs.set('since', since)
  const { data, loading, error, mutate, refetch } = useApi<CheckInsResponse>(`/api/dashboard/checkins?${qs}`)

  const createCheckin = useCallback(async (checkin: { mood: number; energy: number; stress: number }) => {
    const created = await apiCall<CheckIn>('/api/dashboard/checkins', { method: 'POST', body: JSON.stringify(checkin) })
    mutate(prev => prev ? { ...prev, checkins: [created, ...prev.checkins], total: prev.total + 1 } : { checkins: [created], total: 1 })
    return created
  }, [mutate])

  return { checkins: data?.checkins ?? [], loading, error, refetch, createCheckin }
}
