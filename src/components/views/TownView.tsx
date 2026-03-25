'use client'

import dynamic from 'next/dynamic'
import TownHud from '@/components/town/hud/TownHud'
import { useEffect, useState } from 'react'
import { townEvents } from '@/lib/town/events'
import type { SeatDef } from '@/lib/town/events'

const PhaserGame = dynamic(() => import('@/components/town/game/PhaserGame'), { ssr: false })

/**
 * TownView — pixel art office visualization of Octavius quadrant agents.
 * Embeds a Phaser.js game with the office tilemap and animated agent workers.
 *
 * Agents are mapped to quadrants:
 *   Seat 0 → Lifeforce (health)
 *   Seat 1 → Industry (career)
 *   Seat 2 → Fellowship (relationships)
 *   Seat 3 → Essence (soul)
 */
export function TownView() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsub = townEvents.on('seats-discovered', (_seats: SeatDef[]) => {
      setReady(true)
    })
    return unsub
  }, [])

  return (
    <div className="relative w-full h-full min-h-[600px] rounded-xl overflow-hidden border border-[var(--border-primary)]"
      style={{ background: '#1a1a2e' }}>
      {/* Game canvas — full area */}
      <div className="absolute inset-0">
        <PhaserGame />
      </div>

      {/* HUD overlay */}
      <TownHud />

      {/* Loading state */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(26, 26, 46, 0.9)', zIndex: 30 }}>
          <div className="text-center">
            <div className="text-4xl mb-3 animate-pulse">🏢</div>
            <div className="text-sm font-mono text-[#c9a227]">Loading Octavius HQ...</div>
            <div className="text-xs font-mono text-[#666] mt-1">Preparing the office</div>
          </div>
        </div>
      )}
    </div>
  )
}
