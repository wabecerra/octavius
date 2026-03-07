'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface ScheduleItem { id: string; date: string; time: string; title: string; done: boolean }
interface ScheduleResponse { items: ScheduleItem[]; date: string }

export function useSchedule(date?: string) {
  const d = date || new Date().toISOString().split('T')[0]
  const { data, loading, error, mutate, refetch } = useApi<ScheduleResponse>(`/api/dashboard/schedule?date=${d}`)

  const addItem = useCallback(async (item: { time: string; title: string }) => {
    const created = await apiCall<ScheduleItem>('/api/dashboard/schedule', { method: 'POST', body: JSON.stringify({ ...item, date: d }) })
    mutate(prev => prev ? { ...prev, items: [...prev.items, created].sort((a, b) => a.time.localeCompare(b.time)) } : { items: [created], date: d })
    return created
  }, [mutate, d])

  const toggleDone = useCallback(async (id: string, done: boolean) => {
    await apiCall('/api/dashboard/schedule', { method: 'PATCH', body: JSON.stringify({ id, done }) })
    mutate(prev => prev ? { ...prev, items: prev.items.map(i => i.id === id ? { ...i, done } : i) } : { items: [], date: '' })
  }, [mutate])

  return { items: data?.items ?? [], loading, error, refetch, addItem, toggleDone }
}
