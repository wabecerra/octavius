/**
 * GatewayActor — autonomous actor entity for the Gateway Scene.
 * Follows the same pattern as Worker: physics sprite, directional walk/idle
 * animations, emote display, and pathfinding movement.
 *
 * Adds:
 *  - Event queue (enqueueEvent) with sequential processing
 *  - WorkState machine driven by TelemetryEvents
 *  - Emote display mapped from WORK_STATE_EMOTES
 *  - 30-second idle timeout transitioning back to 'idle'
 *  - Error state: displays red emote, stays until next event
 */

import * as Phaser from 'phaser'
import { makeAnims, FRAME_WIDTH, FRAME_HEIGHT, MOVE_SPEED, type Direction } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_FRAMES } from '../config/emotes'
import { type PathPoint, Pathfinder } from '../utils/Pathfinder'
import {
  ARRIVE_THRESHOLD,
  WORKER_SPEED_FACTOR,
  EMOTE_Y_OFFSET,
  BODY_SIZE_RATIO_W,
  BODY_SIZE_RATIO_H,
  BODY_OFFSET_RATIO_X,
  BODY_OFFSET_RATIO_Y,
} from '@/lib/town/constants'
import { WORK_STATE_EMOTES, IDLE_TIMEOUT_MS, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'
import { gatewayEvents } from '@/lib/gateway-view/events'
import type { TelemetryEvent, WorkState, RoomDef, QueuedTelemetryEvent } from '@/lib/gateway-view/types'

/** Sprite key used for the gateway actor character */
const GATEWAY_ACTOR_SPRITE_KEY = 'character_09'

export class GatewayActor {
  sprite: Phaser.Physics.Arcade.Sprite
  workState: WorkState = 'idle'

  private scene: Phaser.Scene
  private spriteKey: string
  private facing: Direction = 'down'
  private pathfinder: Pathfinder

  private path: PathPoint[] = []
  private pathIdx = 0

  private eventQueue: QueuedTelemetryEvent[] = []
  private processing = false
  private currentTargetRoom: RoomDef | null = null
  private pendingWorkState: WorkState = 'idle'

  private emoteSprite: Phaser.GameObjects.Sprite | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    pathfinder: Pathfinder,
    spriteKey: string = GATEWAY_ACTOR_SPRITE_KEY,
  ) {
    this.scene = scene
    this.spriteKey = spriteKey
    this.pathfinder = pathfinder

    // Register directional idle and walk animations
    const idleAnims = makeAnims(spriteKey, 'idle', 1, 8)
    const walkAnims = makeAnims(spriteKey, 'walk', 2, 10)
    for (const anim of [...idleAnims, ...walkAnims]) {
      if (scene.anims.exists(anim.key)) continue
      const frames: Phaser.Types.Animations.AnimationFrame[] = []
      for (let i = anim.start; i <= anim.end; i++) {
        frames.push({ key: spriteKey, frame: i })
      }
      scene.anims.create({ key: anim.key, frames, frameRate: anim.frameRate, repeat: anim.repeat })
    }

    this.sprite = scene.physics.add.sprite(x, y, spriteKey, 0)
    this.sprite.setDepth(5)

    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setSize(FRAME_WIDTH * BODY_SIZE_RATIO_W, FRAME_HEIGHT * BODY_SIZE_RATIO_H)
    body.setOffset(FRAME_WIDTH * BODY_OFFSET_RATIO_X, FRAME_HEIGHT * BODY_OFFSET_RATIO_Y)

    this.sprite.anims.play(`${spriteKey}:idle-${this.facing}`)
    this.scheduleIdleTimeout()
  }

  /**
   * Enqueue a telemetry event for sequential processing.
   * If the actor is in error state, the new event will interrupt it.
   */
  enqueueEvent(event: TelemetryEvent, targetRoom: RoomDef): void {
    this.eventQueue.push({ event, targetRoom })
    // Reset idle timeout whenever a new event arrives
    this.resetIdleTimeout()
    // If currently idle or in error, kick off processing immediately
    if (!this.processing) {
      this.processNext()
    }
  }

  /** Called every frame by the scene's update loop. */
  update(): void {
    // Keep emote sprite following the actor
    if (this.emoteSprite) {
      this.emoteSprite.setPosition(
        this.sprite.x,
        this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
      )
    }

    if (this.path.length === 0 || this.pathIdx >= this.path.length) {
      // Standing still — play idle animation
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setVelocity(0, 0)
      const idleKey = `${this.spriteKey}:idle-${this.facing}`
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey)
      }
      return
    }

    const target = this.path[this.pathIdx]
    const dx = target.x - this.sprite.x
    const dy = target.y - this.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < ARRIVE_THRESHOLD) {
      this.pathIdx++
      if (this.pathIdx >= this.path.length) {
        // Arrived at destination
        this.path = []
        this.onArrived()
      }
      return
    }

    const speed = MOVE_SPEED * WORKER_SPEED_FACTOR
    const vx = (dx / dist) * speed
    const vy = (dy / dist) * speed
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(vx, vy)

    // Update facing direction
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx < 0 ? 'left' : 'right'
    } else {
      this.facing = dy < 0 ? 'up' : 'down'
    }

    const walkKey = `${this.spriteKey}:walk-${this.facing}`
    if (this.sprite.anims.currentAnim?.key !== walkKey) {
      this.sprite.anims.play(walkKey)
    }
  }

  /** Explicitly set the work state and update emote display. */
  setWorkState(state: WorkState): void {
    this.workState = state
    this.updateEmote()
    gatewayEvents.emit('actor-state-changed', state)
  }

  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y }
  }

  getWorkState(): WorkState {
    return this.workState
  }

  destroy(): void {
    this.clearIdleTimeout()
    this.clearEmote()
    this.sprite.destroy()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Pull the next queued event and start navigating to its target room. */
  private processNext(): void {
    if (this.eventQueue.length === 0) {
      this.processing = false
      return
    }

    this.processing = true
    const queued = this.eventQueue.shift()!
    this.currentTargetRoom = queued.targetRoom
    this.pendingWorkState = EVENT_TO_WORK_STATE[queued.event.type]

    // Navigate to the centre of the target room
    const targetX = (queued.targetRoom.x ?? 0) + (queued.targetRoom.width ?? 0) / 2
    const targetY = (queued.targetRoom.y ?? 0) + (queued.targetRoom.height ?? 0) / 2

    const p = this.pathfinder.findPath(this.sprite.x, this.sprite.y, targetX, targetY)
    if (p && p.length > 1) {
      this.path = p
      this.pathIdx = 1
    } else {
      // No path found — apply state immediately without moving
      this.applyEventState(queued)
    }
  }

  /** Called when the actor reaches the end of its current path. */
  private onArrived(): void {
    if (!this.currentTargetRoom) {
      this.processing = false
      return
    }

    const room = this.currentTargetRoom
    this.currentTargetRoom = null

    // Apply the work state that was determined when we started navigating
    this.setWorkState(this.pendingWorkState)
    gatewayEvents.emit('actor-arrived', room.roomId, this.workState)

    // Process the next queued event (if any)
    this.processNext()
  }

  /**
   * Apply the work state from a queued event immediately (used when no path
   * is available or when the actor is already at the destination).
   */
  private applyEventState(queued: QueuedTelemetryEvent): void {
    const state = EVENT_TO_WORK_STATE[queued.event.type]
    this.setWorkState(state)
    gatewayEvents.emit('actor-arrived', queued.targetRoom.roomId, state)
    this.processNext()
  }

  /** Show the emote corresponding to the current work state. */
  private updateEmote(): void {
    const emoteKey = WORK_STATE_EMOTES[this.workState]
    if (!emoteKey) {
      this.clearEmote()
      return
    }
    const frameIdx = EMOTE_FRAMES[emoteKey] ?? 0
    if (this.emoteSprite) {
      // Reuse existing sprite, just update frame
      this.emoteSprite.setFrame(frameIdx)
    } else {
      this.emoteSprite = this.scene.add.sprite(
        this.sprite.x,
        this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
        EMOTE_SHEET_KEY,
        frameIdx,
      )
      this.emoteSprite.setDepth(20).setScale(0.6)
    }
  }

  private clearEmote(): void {
    if (this.emoteSprite) {
      this.emoteSprite.destroy()
      this.emoteSprite = null
    }
  }

  /** Start (or restart) the 30-second idle timeout. */
  private scheduleIdleTimeout(): void {
    this.clearIdleTimeout()
    this.idleTimer = setTimeout(() => {
      // Only transition to idle if not currently processing events
      if (!this.processing && this.eventQueue.length === 0) {
        this.setWorkState('idle')
      }
    }, IDLE_TIMEOUT_MS)
  }

  private resetIdleTimeout(): void {
    this.scheduleIdleTimeout()
  }

  private clearIdleTimeout(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}
