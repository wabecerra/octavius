'use client'

import { useCallback } from 'react'
import { useApi, apiCall } from './use-api'

interface ProfileResponse { [key: string]: string }

export function useProfile() {
  const { data, loading, error, mutate, refetch } = useApi<ProfileResponse>('/api/dashboard/profile')

  const updateProfile = useCallback(async (updates: Record<string, string>) => {
    await apiCall('/api/dashboard/profile', { method: 'PUT', body: JSON.stringify(updates) })
    mutate(prev => prev ? { ...prev, ...updates } : updates)
  }, [mutate])

  return {
    profile: {
      name: data?.name ?? '',
      email: data?.email ?? '',
      timezone: data?.timezone ?? '',
      coreValues: data?.coreValues ?? '',
      lifeVision: data?.lifeVision ?? '',
    },
    loading, error, refetch, updateProfile,
  }
}
