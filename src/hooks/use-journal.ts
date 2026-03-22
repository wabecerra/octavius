'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface JournalEntry { id: string; text: string; timestamp: string }
interface JournalResponse { entries: JournalEntry[] }

export function useJournal(range?: { since?: string; until?: string }) {
  const qs = new URLSearchParams({ limit: '100' })
  if (range?.since) qs.set('since', range.since)
  if (range?.until) qs.set('until', range.until)
  const { data, loading, error, mutate, refetch } = useApi<JournalResponse>(`/api/dashboard/journal?${qs}`)

  const addEntry = useCallback(async (text: string) => {
    const created = await apiCall<JournalEntry>('/api/dashboard/journal', { method: 'POST', body: JSON.stringify({ text }) })
    mutate(prev => prev ? { ...prev, entries: [created, ...prev.entries] } : { entries: [created] })
    return created
  }, [mutate])

  return { entries: data?.entries ?? [], loading, error, refetch, addEntry }
}
