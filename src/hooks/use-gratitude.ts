'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface GratitudeEntry { id: string; date: string; items: string[] }
interface GratitudeResponse { entries: GratitudeEntry[] }

export function useGratitude(range?: { since?: string; until?: string }) {
  const qs = new URLSearchParams({ limit: '30' })
  if (range?.since) qs.set('since', range.since)
  if (range?.until) qs.set('until', range.until)
  const { data, loading, error, mutate, refetch } = useApi<GratitudeResponse>(`/api/dashboard/gratitude?${qs}`)

  const addGratitude = useCallback(async (items: string[], date?: string) => {
    const created = await apiCall<GratitudeEntry>('/api/dashboard/gratitude', { method: 'POST', body: JSON.stringify({ items, date }) })
    mutate(prev => prev ? { ...prev, entries: [created, ...prev.entries] } : { entries: [created] })
    return created
  }, [mutate])

  return { entries: data?.entries ?? [], loading, error, refetch, addGratitude }
}
