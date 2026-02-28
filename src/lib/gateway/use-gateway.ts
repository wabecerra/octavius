'use client'

import { useEffect, useRef, useCallback } from 'react'
import { GatewayClient } from './client'
import { useOctaviusStore } from '@/store'
import type { GatewayStatus } from './types'

/** Singleton GatewayClient shared across the dashboard lifetime. */
let clientInstance: GatewayClient | null = null

export function getGatewayClient(): GatewayClient | null {
  return clientInstance
}

/**
 * Hook that initializes the GatewayClient on mount, subscribes to its events,
 * and syncs state into the Zustand GatewaySlice.
 *
 * Call once at the dashboard root level.
 */
export function useGatewayInit() {
  const address = useOctaviusStore((s) => s.gatewayAddress)
  const port = useOctaviusStore((s) => s.gatewayPort)
  const setGatewayStatus = useOctaviusStore((s) => s.setGatewayStatus)
  const setConnectedAt = useOctaviusStore((s) => s.setConnectedAt)
  const setLastHealthyAt = useOctaviusStore((s) => s.setLastHealthyAt)
  const notifiedRef = useRef<GatewayStatus | null>(null)

  useEffect(() => {
    const client = new GatewayClient({ address, port })
    clientInstance = client

    // Subscribe to status changes → update Zustand store
    const onStatusChanged = (status: GatewayStatus) => {
      setGatewayStatus(status)

      // Non-blocking notification on transitions
      if (notifiedRef.current !== null && notifiedRef.current !== status) {
        if (status === 'disconnected') {
          console.warn('[Gateway] Disconnected — tasks will use fallback adapter')
        } else if (status === 'connected') {
          console.info('[Gateway] Connected')
        }
      }
      notifiedRef.current = status
    }

    const onConnected = (timestamp: string) => {
      setConnectedAt(timestamp)
      setLastHealthyAt(timestamp)
    }

    const onDisconnected = () => {
      setConnectedAt(null)
    }

    const onReconnected = (timestamp: string) => {
      setConnectedAt(timestamp)
      setLastHealthyAt(timestamp)
    }

    const onHealthCheck = (success: boolean, timestamp: string) => {
      if (success) {
        setLastHealthyAt(timestamp)
      }
    }

    client.on('status_changed', onStatusChanged)
    client.on('gateway_connected', onConnected)
    client.on('gateway_disconnected', onDisconnected)
    client.on('gateway_reconnected', onReconnected)
    client.on('health_check', onHealthCheck)

    // Auto-connect on load
    client.connect().catch(() => {
      // connect() handles its own error state
    })

    return () => {
      client.removeAllListeners()
      client.disconnect()
      clientInstance = null
    }
  }, [address, port, setGatewayStatus, setConnectedAt, setLastHealthyAt])
}

/**
 * Hook that provides a reconnect callback for the GatewayStatusPanel.
 */
export function useGatewayReconnect() {
  const setGatewayStatus = useOctaviusStore((s) => s.setGatewayStatus)

  return useCallback(async () => {
    const client = getGatewayClient()
    if (!client) return
    setGatewayStatus('unknown')
    await client.connect()
  }, [setGatewayStatus])
}
