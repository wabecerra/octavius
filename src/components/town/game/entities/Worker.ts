/**
 * Worker entity — represents a quadrant agent in the pixel office.
 * Simplified from agent-town's Worker with Octavius quadrant theming.
 */

import * as Phaser from 'phaser'
import { makeAnims, FRAME_WIDTH, FRAME_HEIGHT, MOVE_SPEED, type Direction } from '../config/animations'
import { EMOTE_SHEET_KEY } from '../config/emotes'
import { EMOTE_FRAMES } from '../config/emotes'
import { type PathPoint, Pathfinder } from '../utils/Pathfinder'
import { type POIDef } from '../utils/MapHelpers'
import {
  ARRIVE_THRESHOLD, WORKER_SPEED_FACTOR, WANDER_MIN_DELAY, WANDER_MAX_DELAY,
  BODY_SIZE_RATIO_W, BODY_SIZE_RATIO_H, BODY_OFFSET_RATIO_X, BODY_OFFSET_RATIO_Y,
  EMOTE_Y_OFFSET, BUBBLE_Y_OFFSET, SEAT_ACTIVITIES, QUADRANT_BUBBLES,
} from '@/lib/town/constants'
import type { SeatStatus } from '@/lib/town/events'
import type { BotState } from '@/lib/town/bot-state-store'
import type { TelemetryEvent, WorkState } from '@/lib/gateway-view/types'
import { WORK_STATE_EMOTES, IDLE_TIMEOUT_MS, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'

interface QueuedWorkerEvent {
  event: TelemetryEvent
  targetRoomId: string
  targetX: number
  targetY: number
}

let wanderClock = 0
export function resetWanderClock() { wanderClock = 0 }

export class Worker {
  sprite: Phaser.Physics.Arcade.Sprite
  seatId: string
  label: string
  quadrant: string
  status: SeatStatus = 'empty'
  workState: WorkState = 'idle'

  private scene: Phaser.Scene
  private spriteKey: string
  private homeX: number
  private homeY: number
  private facing: Direction
  private pathfinder: Pathfinder
  private pois: POIDef[]
  private path: PathPoint[] = []
  private pathIdx = 0
  private wanderTimer: ReturnType<typeof setTimeout> | null = null
  private emoteSprite: Phaser.GameObjects.Sprite | null = null
  private bubbleText: Phaser.GameObjects.Text | null = null
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null
  private activityTimer: ReturnType<typeof setTimeout> | null = null
  private nameLabel: Phaser.GameObjects.Text | null = null

  // ── Room routing & event queue (Task 3.1) ──
  private eventQueue: QueuedWorkerEvent[] = []
  private currentRoomId: string | null = null
  private processingEvent = false
  private lastEventId: string | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    scene: Phaser.Scene, seatId: string, label: string, quadrant: string,
    spriteKey: string, x: number, y: number, facing: Direction,
    pathfinder: Pathfinder, pois: POIDef[],
  ) {
    this.scene = scene; this.seatId = seatId; this.label = label; this.quadrant = quadrant
    this.spriteKey = spriteKey; this.homeX = x; this.homeY = y; this.facing = facing
    this.pathfinder = pathfinder; this.pois = pois

    // Create animations for this sprite
    const idleAnims = makeAnims(spriteKey, 'idle', 1, 8)
    const walkAnims = makeAnims(spriteKey, 'walk', 2, 10)
    for (const anim of [...idleAnims, ...walkAnims]) {
      if (scene.anims.exists(anim.key)) continue
      const frames: Phaser.Types.Animations.AnimationFrame[] = []
      for (let i = anim.start; i <= anim.end; i++) frames.push({ key: spriteKey, frame: i })
      scene.anims.create({ key: anim.key, frames, frameRate: anim.frameRate, repeat: anim.repeat })
    }

    this.sprite = scene.physics.add.sprite(x, y, spriteKey, 0)
    this.sprite.setDepth(5)
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setSize(FRAME_WIDTH * BODY_SIZE_RATIO_W, FRAME_HEIGHT * BODY_SIZE_RATIO_H)
    body.setOffset(FRAME_WIDTH * BODY_OFFSET_RATIO_X, FRAME_HEIGHT * BODY_OFFSET_RATIO_Y)
    this.sprite.anims.play(`${spriteKey}:idle-${facing}`)

    // Add name label (follows sprite in update())
    this.nameLabel = scene.add.text(x, y + FRAME_HEIGHT * 0.15, label, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0).setDepth(15)

    this.scheduleWander()
  }

  setStatus(status: SeatStatus, taskSnippet?: string) {
    this.status = status
    this.clearEmote()
    this.clearBubble()
    if (status === 'running') {
      this.goHome()
      this.showEmote('emote:device')
      if (taskSnippet) this.showBubble(taskSnippet, 4000)
      this.startActivityLoop()
    } else if (status === 'done') {
      this.showEmote('emote:star')
      this.showBubble('Done!', 3000)
      setTimeout(() => { this.status = 'empty'; this.clearEmote(); this.scheduleWander() }, 4000)
    } else if (status === 'failed') {
      this.showEmote('emote:angry')
      this.showBubble('Failed...', 3000)
      setTimeout(() => { this.status = 'empty'; this.clearEmote(); this.scheduleWander() }, 4000)
    } else {
      this.stopActivityLoop()
      this.scheduleWander()
    }
  }

  showBubble(text: string, ttl: number) {
    this.clearBubble()
    this.bubbleText = this.scene.add.text(this.sprite.x, this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET, text, {
      fontFamily: 'monospace', fontSize: '11px', color: '#222',
      backgroundColor: '#fff', padding: { x: 6, y: 3 }, wordWrap: { width: 140 },
    }).setOrigin(0.5, 1).setDepth(20)
    this.bubbleTimer = setTimeout(() => this.clearBubble(), ttl)
  }

  private clearBubble() {
    if (this.bubbleTimer) { clearTimeout(this.bubbleTimer); this.bubbleTimer = null }
    if (this.bubbleText) { this.bubbleText.destroy(); this.bubbleText = null }
  }

  private showEmote(emoteKey: string) {
    this.clearEmote()
    const frameIdx = EMOTE_FRAMES[emoteKey] ?? 0
    this.emoteSprite = this.scene.add.sprite(this.sprite.x, this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET, EMOTE_SHEET_KEY, frameIdx)
    this.emoteSprite.setDepth(20).setScale(0.6)
  }

  private clearEmote() {
    if (this.emoteSprite) { this.emoteSprite.destroy(); this.emoteSprite = null }
  }

  private startActivityLoop() {
    this.stopActivityLoop()
    const tick = () => {
      if (this.status !== 'running') return
      const act = SEAT_ACTIVITIES[Math.floor(Math.random() * SEAT_ACTIVITIES.length)]
      this.showEmote(act.emote)
      const bubbles = QUADRANT_BUBBLES[this.quadrant] ?? act.bubbles
      this.showBubble(bubbles[Math.floor(Math.random() * bubbles.length)], 3000)
      const dur = act.minDuration + Math.random() * (act.maxDuration - act.minDuration)
      this.activityTimer = setTimeout(tick, dur)
    }
    this.activityTimer = setTimeout(tick, 3000)
  }

  private stopActivityLoop() {
    if (this.activityTimer) { clearTimeout(this.activityTimer); this.activityTimer = null }
  }

  private goHome() {
    if (this.wanderTimer) { clearTimeout(this.wanderTimer); this.wanderTimer = null }
    const p = this.pathfinder.findPath(this.sprite.x, this.sprite.y, this.homeX, this.homeY)
    if (p && p.length > 1) { this.path = p; this.pathIdx = 1 }
  }

  private scheduleWander() {
    if (this.status === 'running') return
    if (this.wanderTimer) clearTimeout(this.wanderTimer)
    const delay = WANDER_MIN_DELAY + Math.random() * (WANDER_MAX_DELAY - WANDER_MIN_DELAY) + wanderClock * 500
    wanderClock++
    this.wanderTimer = setTimeout(() => {
      if (this.status === 'running') return
      // Pick a random POI or home
      const target = this.pois.length > 0 && Math.random() < 0.4
        ? this.pois[Math.floor(Math.random() * this.pois.length)]
        : { x: this.homeX, y: this.homeY }
      const p = this.pathfinder.findPath(this.sprite.x, this.sprite.y, target.x, target.y)
      if (p && p.length > 1) { this.path = p; this.pathIdx = 1 }
      this.scheduleWander()
    }, delay)
  }

  update() {
    // Update emote/bubble/label positions to follow sprite
    if (this.emoteSprite) this.emoteSprite.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET)
    if (this.bubbleText) this.bubbleText.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET)
    if (this.nameLabel) this.nameLabel.setPosition(this.sprite.x, this.sprite.y + FRAME_HEIGHT * 0.15)

    if (this.path.length === 0 || this.pathIdx >= this.path.length) {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setVelocity(0, 0)
      const idleKey = `${this.spriteKey}:idle-${this.facing}`
      if (this.sprite.anims.currentAnim?.key !== idleKey) this.sprite.anims.play(idleKey)
      return
    }

    const target = this.path[this.pathIdx]
    const dx = target.x - this.sprite.x, dy = target.y - this.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < ARRIVE_THRESHOLD) {
      this.pathIdx++
      if (this.pathIdx >= this.path.length) {
        this.path = []
        this.onArrived()
        return
      }
      return
    }

    const speed = MOVE_SPEED * WORKER_SPEED_FACTOR
    const vx = (dx / dist) * speed, vy = (dy / dist) * speed
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(vx, vy)

    if (Math.abs(dx) > Math.abs(dy)) { this.facing = dx < 0 ? 'left' : 'right' }
    else { this.facing = dy < 0 ? 'up' : 'down' }
    const walkKey = `${this.spriteKey}:walk-${this.facing}`
    if (this.sprite.anims.currentAnim?.key !== walkKey) this.sprite.anims.play(walkKey)
  }

  // ── Room routing & event queue methods (Task 3.1) ──

  /**
   * Enqueue a telemetry event, pathfind to the target room center, and
   * process the next event on arrival. Follows the GatewayActor pattern.
   */
  enqueueEvent(event: TelemetryEvent, targetRoomId: string, targetX: number, targetY: number): void {
    this.eventQueue.push({ event, targetRoomId, targetX, targetY })
    this.resetIdleTimeout()
    if (!this.processingEvent) {
      this.processNextEvent()
    }
  }

  /** Return the room the worker is currently in or heading to. */
  getCurrentRoomId(): string | null {
    return this.currentRoomId
  }

  /** Export serializable state for BotStateStore persistence. */
  getSerializableState(): BotState {
    return {
      seatId: this.seatId,
      x: this.sprite.x,
      y: this.sprite.y,
      facing: this.facing,
      status: this.status,
      currentRoomId: this.currentRoomId,
      path: this.path,
      pathIdx: this.pathIdx,
      workState: this.workState,
      lastEventId: this.lastEventId,
    }
  }

  /** Restore worker from persisted BotState on scene init. */
  restoreState(state: BotState): void {
    this.sprite.setPosition(state.x, state.y)
    this.facing = state.facing
    this.status = state.status
    this.currentRoomId = state.currentRoomId
    this.workState = state.workState
    this.lastEventId = state.lastEventId

    // Update visual to match restored facing
    this.sprite.anims.play(`${this.spriteKey}:idle-${this.facing}`)
    if (this.nameLabel) this.nameLabel.setPosition(state.x, state.y + FRAME_HEIGHT * 0.15)

    // Show emote for restored work state
    if (this.workState !== 'idle') {
      this.updateWorkStateEmote()
    }

    // Resume interrupted path from saved index
    if (state.path.length > 0 && state.pathIdx < state.path.length) {
      this.path = state.path
      this.pathIdx = state.pathIdx
      this.processingEvent = true // mark as navigating so arrival triggers correctly
    } else if (this.workState === 'idle') {
      this.scheduleWander()
    }

    this.scheduleIdleTimeout()
  }

  // ── Private event queue helpers ──

  private processNextEvent(): void {
    if (this.eventQueue.length === 0) {
      this.processingEvent = false
      return
    }

    this.processingEvent = true
    const queued = this.eventQueue.shift()!
    this.currentRoomId = queued.targetRoomId
    this.lastEventId = queued.event.eventId
    this._pendingWorkState = EVENT_TO_WORK_STATE[queued.event.type] ?? 'processing'

    // Stop wandering while processing events
    if (this.wanderTimer) { clearTimeout(this.wanderTimer); this.wanderTimer = null }

    const p = this.pathfinder.findPath(this.sprite.x, this.sprite.y, queued.targetX, queued.targetY)
    if (p && p.length > 1) {
      this.path = p
      this.pathIdx = 1
    } else {
      // No walkable path — apply work state immediately without moving (Req 3.5)
      this.setWorkState(this._pendingWorkState)
      this.scheduleIdleTimeout()
      this.processingEvent = false
      this.processNextEvent()
    }
  }

  /** Called when the worker reaches the end of its current path. */
  private onArrived(): void {
    if (!this.processingEvent) return

    // Apply work state and display emote on arrival (Req 3.3)
    this.setWorkState(this._pendingWorkState)
    this.processingEvent = false

    // Schedule idle timeout (Req 4.2)
    this.scheduleIdleTimeout()

    // Process next queued event
    this.processNextEvent()
  }

  private _pendingWorkState: WorkState = 'idle'

  /** Set the telemetry-driven work state and update emote. */
  private setWorkState(state: WorkState): void {
    this.workState = state
    this.updateWorkStateEmote()
  }

  /** Show the emote corresponding to the current work state. */
  private updateWorkStateEmote(): void {
    const emoteKey = WORK_STATE_EMOTES[this.workState]
    if (!emoteKey) {
      this.clearEmote()
      return
    }
    this.showEmote(emoteKey)
  }

  /** Start (or restart) the 30-second idle timeout (Req 4.2). */
  private scheduleIdleTimeout(): void {
    this.clearIdleTimeout()
    this.idleTimer = setTimeout(() => {
      if (!this.processingEvent && this.eventQueue.length === 0) {
        this.setWorkState('idle')
        this.currentRoomId = null
        this.scheduleWander()
      }
    }, IDLE_TIMEOUT_MS)
  }

  private resetIdleTimeout(): void {
    this.scheduleIdleTimeout()
  }

  private clearIdleTimeout(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
  }

  destroy() {
    if (this.wanderTimer) clearTimeout(this.wanderTimer)
    this.stopActivityLoop()
    this.clearEmote()
    this.clearBubble()
    this.clearIdleTimeout()
    if (this.nameLabel) { this.nameLabel.destroy(); this.nameLabel = null }
    this.sprite.destroy()
  }
}
