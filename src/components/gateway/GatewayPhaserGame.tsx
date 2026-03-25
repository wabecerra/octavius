'use client'

/**
 * GatewayPhaserGame — Dynamic Phaser wrapper for the Gateway View.
 *
 * Follows the same pattern as `PhaserGame` (NerveCenterView):
 * - Dynamically imports Phaser to avoid SSR issues
 * - Creates a Phaser.Game instance configured with GatewayScene
 * - Mounts to a div ref
 * - Cleans up the game instance on unmount
 *
 * Requirements: 8.3, 8.4
 */

import { useEffect, useRef } from 'react'
import type * as PhaserTypes from 'phaser'

interface GatewayPhaserGameProps {
  width?: number | string
  height?: number | string
}

export default function GatewayPhaserGame({ width = '100%', height = '100%' }: GatewayPhaserGameProps) {
  const gameRef = useRef<PhaserTypes.Game | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true

    async function initGame() {
      if (!containerRef.current) return
      const Phaser = await import('phaser')
      const { GatewayScene } = await import('@/components/town/game/scenes/GatewayScene')
      if (!mounted) return

      const config: PhaserTypes.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        pixelArt: true,
        antialias: false,
        roundPixels: true,
        scene: [GatewayScene],
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
        parent: containerRef.current,
      }

      gameRef.current = new Phaser.Game(config)
    }

    initGame().catch(err => console.error('[GatewayPhaserGame] init failed:', err))

    return () => {
      mounted = false
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width, height, overflow: 'hidden', imageRendering: 'pixelated' }}
    />
  )
}
