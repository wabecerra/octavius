'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { GatewayClient } from './client'
import type { GatewayStatus } from './types'

/** Singleton GatewayClient shared across the dashboard lifetime. */
let clientInstance: GatewayClient | null = null

export function getGatewayClient(): GatewayClient | null {
  return clientInstance
}

export interface GatewayState {
  status: GatewayStatus
  connectedAt: string | null
  lastHealthyAt: string | null
}

/**
 * Hook that initializes the GatewayClient on mount.
 * Returns gateway state directly (no Zustand).
 */
export function useGatewayInit(address: string = 'localhost', port: number = 18789) {
  const [state, setState] = useState<GatewayState>({
    status: 'unknown',
    connectedAt: null,
    lastHealthyAt: null,
  })
  const notifiedRef = useRef<GatewayStatus | null>(null)

  useEffect(() => {
    const client = new GatewayClient({ address, port })
    clientInstance = client

    const onStatusChanged = (status: GatewayStatus) => {
      setState(s => ({ ...s, status }))
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
      setState(s => ({ ...s, connectedAt: timestamp, lastHealthyAt: timestamp }))
    }

    const onDisconnected = () => {
      setState(s => ({ ...s, connectedAt: null }))
    }

    const onReconnected = (timestamp: string) => {
      setState(s => ({ ...s, connectedAt: timestamp, lastHealthyAt: timestamp }))
    }

    const onHealthCheck = (success: boolean, timestamp: string) => {
      if (success) {
        setState(s => ({ ...s, lastHealthyAt: timestamp }))
      }
    }

    client.on('status_changed', onStatusChanged)
    client.on('gateway_connected', onConnected)
    client.on('gateway_disconnected', onDisconnected)
    client.on('gateway_reconnected', onReconnected)
    client.on('health_check', onHealthCheck)

    client.connect().catch(() => {})

    return () => {
      client.removeAllListeners()
      client.disconnect()
      clientInstance = null
    }
  }, [address, port])

  return state
}

/**
 * Hook that provides a reconnect callback.
 */
export function useGatewayReconnect() {
  return useCallback(async () => {
    const client = getGatewayClient()
    if (!client) return
    await client.connect()
  }, [])
}
