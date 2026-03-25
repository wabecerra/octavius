'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { getFleetStore, type FleetSnapshot } from './fleet-store'

/**
 * Hook to read the fleet store with automatic re-renders on change.
 * State persists across tab switches via sessionStorage.
 */
export function useFleet(): FleetSnapshot {
  const store = getFleetStore()
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  )
}

/**
 * Hook to fetch and sync agent model configs from the API into the fleet store.
 * Call once at the top level.
 */
export function useFleetConfigSync() {
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (synced) return
    const store = getFleetStore()
    fetch('/api/agents/config')
      .then(r => r.json())
      .then(data => {
        if (data.configs) {
          for (const cfg of data.configs as Array<{ agentId: string; model: string }>) {
            store.updateAgentModel(cfg.agentId, cfg.model)
          }
        }
        setSynced(true)
      })
      .catch(() => setSynced(true))
  }, [synced])
}
