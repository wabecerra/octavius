'use client'

import { useEffect, useState } from 'react'
import { townEvents, type TownSeatState, type SeatStatus } from '@/lib/town/events'
import type { SeatDef } from '@/lib/town/events'

const QUADRANT_COLORS: Record<string, string> = {
  lifeforce: '#22c55e',
  industry: '#3b82f6',
  fellowship: '#f59e0b',
  essence: '#a855f7',
}

const QUADRANT_ICONS: Record<string, string> = {
  lifeforce: '💚',
  industry: '💼',
  fellowship: '🤝',
  essence: '🧘',
}

const STATUS_DOTS: Record<SeatStatus, string> = {
  empty: '⚪',
  running: '🟢',
  returning: '🟡',
  done: '✅',
  failed: '🔴',
}

export default function TownHud() {
  const [seats, setSeats] = useState<TownSeatState[]>([])

  useEffect(() => {
    const unsub1 = townEvents.on('seats-discovered', (discovered: SeatDef[]) => {
      const quadrants = ['lifeforce', 'industry', 'fellowship', 'essence']
      setSeats(discovered.map((s, i) => ({
        seatId: s.seatId,
        label: s.label ?? s.seatId,
        quadrant: (quadrants[i] ?? 'industry') as TownSeatState['quadrant'],
        status: 'empty' as SeatStatus,
      })))
    })

    const unsub2 = townEvents.on('agent-status', (seatId: string, status: SeatStatus) => {
      setSeats(prev => prev.map(s => s.seatId === seatId ? { ...s, status } : s))
    })

    const unsub3 = townEvents.on('task-assigned', (seatId: string, message: string) => {
      setSeats(prev => prev.map(s => s.seatId === seatId ? { ...s, status: 'running' as SeatStatus, taskSnippet: message.slice(0, 40) } : s))
    })

    const unsub4 = townEvents.on('task-completed', (seatId: string) => {
      setSeats(prev => prev.map(s => s.seatId === seatId ? { ...s, status: 'done' as SeatStatus } : s))
    })

    const unsub5 = townEvents.on('task-failed', (seatId: string) => {
      setSeats(prev => prev.map(s => s.seatId === seatId ? { ...s, status: 'failed' as SeatStatus } : s))
    })

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5() }
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
      {/* Top bar — agent status pills */}
      <div className="flex items-center gap-2 p-3 pointer-events-auto">
        <div className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-mono"
          style={{ background: 'rgba(0,0,0,0.75)', color: '#c9a227', backdropFilter: 'blur(8px)' }}>
          🏢 Octavius HQ
        </div>
        {seats.map(seat => (
          <div key={seat.seatId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono"
            style={{
              background: 'rgba(0,0,0,0.75)',
              color: QUADRANT_COLORS[seat.quadrant ?? 'industry'],
              backdropFilter: 'blur(8px)',
              border: seat.status === 'running' ? `1px solid ${QUADRANT_COLORS[seat.quadrant ?? 'industry']}40` : '1px solid transparent',
            }}>
            <span>{QUADRANT_ICONS[seat.quadrant ?? 'industry']}</span>
            <span>{seat.label}</span>
            <span>{STATUS_DOTS[seat.status]}</span>
          </div>
        ))}
      </div>

      {/* Bottom bar — controls hint */}
      <div className="absolute bottom-3 left-3 pointer-events-auto">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full text-xs font-mono"
          style={{ background: 'rgba(0,0,0,0.75)', color: '#888', backdropFilter: 'blur(8px)' }}>
          <span>WASD / Arrows to move</span>
          <span>•</span>
          <span>Scroll to zoom</span>
        </div>
      </div>
    </div>
  )
}
