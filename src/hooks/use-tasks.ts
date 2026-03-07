'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

export interface Task {
  id: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  status: 'backlog' | 'in-progress' | 'done'
  dueDate?: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

interface TasksResponse { tasks: Task[]; total: number }

export function useTasks(filter?: { status?: string; priority?: string }) {
  const qs = new URLSearchParams()
  if (filter?.status) qs.set('status', filter.status)
  if (filter?.priority) qs.set('priority', filter.priority)
  qs.set('limit', '200')
  const { data, loading, error, mutate, refetch } = useApi<TasksResponse>(`/api/dashboard/tasks?${qs}`)

  const createTask = useCallback(async (task: { title: string; description?: string; priority?: string; status?: string; dueDate?: string }) => {
    const created = await apiCall<Task>('/api/dashboard/tasks', { method: 'POST', body: JSON.stringify(task) })
    mutate(prev => prev ? { ...prev, tasks: [created, ...prev.tasks], total: prev.total + 1 } : { tasks: [created], total: 1 })
    return created
  }, [mutate])

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const updated = await apiCall<Task>(`/api/dashboard/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })
    mutate(prev => prev ? { ...prev, tasks: prev.tasks.map(t => t.id === id ? updated : t) } : { tasks: [], total: 0 })
    return updated
  }, [mutate])

  const deleteTask = useCallback(async (id: string) => {
    await apiCall(`/api/dashboard/tasks/${id}`, { method: 'DELETE' })
    mutate(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== id), total: prev.total - 1 } : { tasks: [], total: 0 })
  }, [mutate])

  return {
    tasks: data?.tasks ?? [],
    total: data?.total ?? 0,
    loading, error, refetch,
    createTask, updateTask, deleteTask,
  }
}
