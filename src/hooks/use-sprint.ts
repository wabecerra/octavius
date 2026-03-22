'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  getCurrentSprint,
  getPreviousSprint,
  getNextSprint,
  isCurrentSprint,
  isInSprint,
  type Sprint,
} from '@/lib/sprint'

export type { Sprint }

/**
 * Sprint navigation hook.
 *
 * Provides the active sprint (defaults to current week) and
 * helpers to navigate between sprints and filter data.
 */
export function useSprint() {
  const [sprint, setSprint] = useState<Sprint>(getCurrentSprint)

  const goBack = useCallback(() => setSprint((s) => getPreviousSprint(s)), [])
  const goForward = useCallback(() => setSprint((s) => getNextSprint(s)), [])
  const goToday = useCallback(() => setSprint(getCurrentSprint()), [])

  const isCurrent = useMemo(() => isCurrentSprint(sprint), [sprint])

  /** Filter an array of items to only those within the active sprint. */
  const filterBySprint = useCallback(
    <T extends { timestamp?: string; createdAt?: string; date?: string }>(
      items: T[],
    ): T[] =>
      items.filter((item) => {
        const ts = item.timestamp ?? item.createdAt ?? item.date ?? ''
        return ts ? isInSprint(ts, sprint) : false
      }),
    [sprint],
  )

  return {
    sprint,
    isCurrent,
    goBack,
    goForward,
    goToday,
    filterBySprint,
  }
}
