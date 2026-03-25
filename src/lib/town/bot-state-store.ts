/**
 * Bot State Store — persists bot position, status, current room, and walking
 * path across browser refresh via sessionStorage.
 *
 * Uses a debounced save (500ms) to avoid excessive writes.
 * Key is `octavius-bot-state` to avoid collision with fleet-store's
 * `octavius-fleet-state`.
 */

import type { Direction } from '@/components/town/game/config/animations'
import type { PathPoint } from '@/components/town/game/utils/Pathfinder'
import type { SeatStatus } from './events'
import type { WorkState } from '@/lib/gateway-view/types'

// ── Types ──

export interface BotState {
  seatId: string
  x: number
  y: number
  facing: Direction
  status: SeatStatus
  currentRoomId: string | null
  path: PathPoint[]
  pathIdx: number
  workState: WorkState
  lastEventId: string | null
}

// ── Store ──

const STORAGE_KEY = 'octavius-bot-state'
const DEBOUNCE_MS = 500

export class BotStateStore {
  private timer: ReturnType<typeof setTimeout> | null = null

  /** Debounced write of bot states to sessionStorage. */
  save(states: BotState[]): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      if (typeof window === 'undefined') return
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(states))
      } catch {
        /* quota exceeded — silently drop */
      }
    }, DEBOUNCE_MS)
  }

  /** Read persisted bot states. Returns empty array when nothing stored. */
  load(): BotState[] {
    if (typeof window === 'undefined') return []
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      return JSON.parse(raw) as BotState[]
    } catch {
      return []
    }
  }

  /** Remove persisted state. */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(STORAGE_KEY)
  }
}
