'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface FocusGoal { id: string; date: string; title: string }
interface FocusGoalsResponse { goals: FocusGoal[]; date: string }

export function useFocusGoals(date?: string) {
  const d = date || new Date().toISOString().split('T')[0]
  const { data, loading, error, mutate, refetch } = useApi<FocusGoalsResponse>(`/api/dashboard/focus-goals?date=${d}`)

  const addGoal = useCallback(async (title: string) => {
    const created = await apiCall<FocusGoal>('/api/dashboard/focus-goals', { method: 'POST', body: JSON.stringify({ title, date: d }) })
    mutate(prev => prev ? { ...prev, goals: [...prev.goals, created] } : { goals: [created], date: d })
    return created
  }, [mutate, d])

  const removeGoal = useCallback(async (id: string) => {
    await apiCall('/api/dashboard/focus-goals', { method: 'DELETE', body: JSON.stringify({ id }) })
    mutate(prev => prev ? { ...prev, goals: prev.goals.filter(g => g.id !== id) } : { goals: [], date: '' })
  }, [mutate])

  return { goals: data?.goals ?? [], loading, error, refetch, addGoal, removeGoal }
}
