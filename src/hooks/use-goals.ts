'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface Goal {
  id: string; quadrant: string; title: string
  description: string; targetDate?: string; progressPct: number; createdAt: string
}
interface GoalsResponse { goals: Goal[] }

export function useGoals(quadrant?: string) {
  const url = quadrant ? `/api/dashboard/goals?quadrant=${quadrant}` : '/api/dashboard/goals'
  const { data, loading, error, mutate, refetch } = useApi<GoalsResponse>(url)

  const createGoal = useCallback(async (goal: { quadrant: string; title: string; description?: string; targetDate?: string }) => {
    const created = await apiCall<Goal>('/api/dashboard/goals', { method: 'POST', body: JSON.stringify(goal) })
    mutate(prev => prev ? { ...prev, goals: [...prev.goals, created] } : { goals: [created] })
    return created
  }, [mutate])

  const updateProgress = useCallback(async (id: string, progressPct: number) => {
    await apiCall('/api/dashboard/goals', { method: 'PATCH', body: JSON.stringify({ id, progressPct }) })
    mutate(prev => prev ? { ...prev, goals: prev.goals.map(g => g.id === id ? { ...g, progressPct } : g) } : { goals: [] })
  }, [mutate])

  return { goals: data?.goals ?? [], loading, error, refetch, createGoal, updateProgress }
}
