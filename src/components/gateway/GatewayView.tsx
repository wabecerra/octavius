'use client'

/**
 * GatewayView — top-level React component for the Gateway spatial view.
 *
 * Follows the NerveCenterView pattern:
 * - Dynamically imports GatewayPhaserGame (no SSR)
 * - Initializes TelemetryPipeline on mount, attaches WsGatewayClient, destroys on unmount
 * - Subscribes to GatewayEventBus for room-modal-open/close and telemetry-event
 * - Renders ActivityHud and RoomModal overlays
 * - Shows loading state until gateway-scene-ready fires
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5
 */

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { TelemetryPipeline } from '@/lib/gateway-view/telemetry'
import { WsGatewayClient } from '@/lib/town/ws-gateway'
import { ActivityHud } from '@/components/gateway/ActivityHud'
import { RoomModal } from '@/components/gateway/RoomModal'
import type { TelemetryEvent, AssetManifest } from '@/lib/gateway-view/types'
import { HUD_MAX_EVENTS } from '@/lib/gateway-view/constants'

// Dynamic import — no SSR (Phaser requires browser APIs)
const GatewayPhaserGame = dynamic(
  () => import('@/components/gateway/GatewayPhaserGame'),
  { ssr: false }
)

// ── Main View ──────────────────────────────────────────────────────────────

export function GatewayView() {
  const [sceneReady, setSceneReady] = useState(false)
  const [sceneError, setSceneError] = useState<string | null>(null)
  const [hudVisible, setHudVisible] = useState(false)
  const [hudEvents, setHudEvents] = useState<TelemetryEvent[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [modalRoomId, setModalRoomId] = useState<string | null>(null)
  const [assetManifest, setAssetManifest] = useState<AssetManifest | null>(null)

  // Stable refs so effect cleanup closures don't capture stale values
  const pipelineRef = useRef<TelemetryPipeline | null>(null)
  const wsClientRef = useRef<WsGatewayClient | null>(null)

  // ── Load AssetManifest once ──
  useEffect(() => {
    fetch('/town/gateway/gateway-asset.manifest.json')
      .then(r => r.json())
      .then((data: AssetManifest) => setAssetManifest(data))
      .catch(err => console.error('[GatewayView] failed to load asset manifest:', err))
  }, [])

  // ── TelemetryPipeline lifecycle ──
  useEffect(() => {
    // Initialize pipeline
    const pipeline = new TelemetryPipeline(gatewayEvents)
    pipelineRef.current = pipeline

    // Attach WsGatewayClient
    const wsClient = new WsGatewayClient()
    wsClientRef.current = wsClient
    pipeline.attachWebSocket(wsClient)
    wsClient.connect().catch(() => {
      // Connection failure is non-fatal — pipeline degrades gracefully
    })

    return () => {
      pipeline.destroy()
      pipelineRef.current = null
      wsClient.disconnect()
      wsClientRef.current = null
    }
  }, [])

  // ── GatewayEventBus subscriptions ──
  useEffect(() => {
    // Scene ready → hide loading overlay
    const offReady = gatewayEvents.on('gateway-scene-ready', () => {
      setSceneReady(true)
    })

    // Scene error → show error instead of loading
    const offError = gatewayEvents.on('gateway-scene-error', (error: string) => {
      setSceneError(error)
    })

    // Room click → open modal
    const offModalOpen = gatewayEvents.on('room-modal-open', (roomId: string) => {
      setModalRoomId(roomId)
    })

    // Modal close from scene side
    const offModalClose = gatewayEvents.on('room-modal-close', () => {
      setModalRoomId(null)
    })

    // Telemetry events → maintain HUD list (capped at HUD_MAX_EVENTS)
    const offTelemetry = gatewayEvents.on('telemetry-event', (event: TelemetryEvent) => {
      setHudEvents(prev => {
        const next = [event, ...prev]
        return next.length > HUD_MAX_EVENTS ? next.slice(0, HUD_MAX_EVENTS) : next
      })
      // Increment unread badge when HUD is hidden
      if (!hudVisible) {
        setUnreadCount(c => c + 1)
      }
    })

    return () => {
      offReady()
      offError()
      offModalOpen()
      offModalClose()
      offTelemetry()
    }
  }, [hudVisible])

  // Reset unread count when HUD becomes visible
  useEffect(() => {
    if (hudVisible) setUnreadCount(0)
  }, [hudVisible])

  // ── Handlers ──
  const handleModalClose = () => {
    setModalRoomId(null)
    gatewayEvents.emit('room-modal-close')
  }

  const handleHudToggle = () => setHudVisible(v => !v)

  return (
    <div
      className="relative rounded-xl overflow-hidden border"
      style={{
        background: 'var(--bg-tertiary)',
        borderColor: 'var(--border-primary)',
        height: 'calc(100vh - 200px)',
        minHeight: '480px',
      }}
    >
      {/* Phaser canvas */}
      <div className="absolute inset-0">
        <GatewayPhaserGame />
      </div>

      {/* HUD overlay — pointer-events-none wrapper, children opt in */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        <ActivityHud
          events={hudEvents}
          visible={hudVisible}
          newCount={unreadCount}
          onToggle={handleHudToggle}
        />
      </div>

      {/* Room Modal */}
      {modalRoomId && assetManifest && (
        <RoomModal
          roomId={modalRoomId}
          assetManifest={assetManifest}
          onClose={handleModalClose}
        />
      )}

      {/* Loading overlay — shown until gateway-scene-ready fires */}
      {!sceneReady && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(18,20,26,0.95)', zIndex: 30 }}
        >
          <div className="text-center">
            {sceneError ? (
              <>
                <div className="text-3xl mb-2">⚠️</div>
                <div className="text-xs font-mono mb-2" style={{ color: '#ff6b6b' }}>
                  Gateway Scene Error
                </div>
                <div className="text-xs font-mono max-w-md whitespace-pre-wrap" style={{ color: '#999' }}>
                  {sceneError}
                </div>
              </>
            ) : (
              <>
                <div className="text-3xl mb-2 animate-pulse">🌐</div>
                <div className="text-xs font-mono" style={{ color: 'var(--accent)' }}>
                  Loading Gateway…
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default GatewayView
