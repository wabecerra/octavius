'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type FetchState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Lightweight data-fetching hook (no external deps).
 * Returns { data, loading, error, mutate, refetch }.
 *
 * - Fetches on mount and when `url` changes
 * - `mutate(newData)` optimistically updates and triggers revalidation
 * - `refetch()` forces a fresh fetch
 */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null })
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    if (!url) { setState({ data: null, loading: false, error: null }); return }
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (mountedRef.current) setState({ data, loading: false, error: null })
    } catch (err) {
      if (mountedRef.current) setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Fetch failed' }))
    }
  }, [url])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData])

  const mutate = useCallback((newData: T | ((prev: T | null) => T)) => {
    setState(s => ({
      ...s,
      data: typeof newData === 'function' ? (newData as (prev: T | null) => T)(s.data) : newData,
    }))
    // Revalidate in background
    fetchData()
  }, [fetchData])

  return { ...state, mutate, refetch: fetchData }
}

/**
 * POST/PATCH/DELETE helper that returns JSON and throws on error.
 */
export async function apiCall<T = unknown>(url: string, options: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}
