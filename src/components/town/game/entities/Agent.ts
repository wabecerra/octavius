/**
 * Agent entity — represents a generalist or specialist agent in the Nerve Center.
 * Uses BFS pathfinding on a walk graph to navigate between rooms.
 * Does NOT import from Worker.ts; follows the same animation/emote patterns independently.
 */

import * as Phaser from 'phaser'
import { makeAnims, FRAME_WIDTH, FRAME_HEIGHT, MOVE_SPEED, type Direction } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_FRAMES } from '../config/emotes'
import {
  ARRIVE_THRESHOLD, WORKER_SPEED_FACTOR, WANDER_MIN_DELAY, WANDER_MAX_DELAY,
  BODY_SIZE_RATIO_W, BODY_SIZE_RATIO_H, BODY_OFFSET_RATIO_X, BODY_OFFSET_RATIO_Y,
  EMOTE_Y_OFFSET, BUBBLE_Y_OFFSET,
} from '@/lib/town/constants'
import { WORK_STATE_EMOTES, IDLE_TIMEOUT_MS } from '@/lib/gateway-view/constants'
import { ROOM_BEHAVIORS, DEFAULT_BEHAVIOR } from '../config/room-behaviors'
import { MOOD_VISUALS, type AgentMood } from '../config/mood'
import type { WorkState } from '@/lib/gateway-view/types'
import type { SeatStatus } from '@/lib/town/events'

// ---------------------------------------------------------------------------
// Walk Graph types
// ---------------------------------------------------------------------------

export interface WalkNode {
  x: number
  y: number
  roomId?: string
}

export interface WalkGraphData {
  nodes: Record<string, WalkNode>
  edges: [string, string][]
}

interface PathStep {
  nodeId: string
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Walk Graph BFS utilities
// ---------------------------------------------------------------------------

/** Build adjacency list from edge pairs. */
function buildAdjacency(graph: WalkGraphData): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const id of Object.keys(graph.nodes)) {
    adj.set(id, [])
  }
  for (const [a, b] of graph.edges) {
    adj.get(a)?.push(b)
    adj.get(b)?.push(a)
  }
  return adj
}

/** BFS shortest path from `fromId` to `toId`. Returns ordered PathStep[] or null. */
export function bfsPath(graph: WalkGraphData, fromId: string, toId: string): PathStep[] | null {
  if (fromId === toId) {
    const node = graph.nodes[fromId]
    if (!node) return null
    return [{ nodeId: fromId, x: node.x, y: node.y }]
  }
  if (!graph.nodes[fromId] || !graph.nodes[toId]) return null

  const adj = buildAdjacency(graph)
  const visited = new Set<string>([fromId])
  const parent = new Map<string, string>()
  const queue: string[] = [fromId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === toId) {
      // Reconstruct path
      const path: PathStep[] = []
      let id: string | undefined = toId
      while (id !== undefined) {
        const node = graph.nodes[id]
        path.unshift({ nodeId: id, x: node.x, y: node.y })
        id = parent.get(id)
      }
      return path
    }
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        parent.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }
  return null // no path
}

/** Find the closest walk graph node to a world position. */
export function nearestNode(graph: WalkGraphData, x: number, y: number): string | null {
  let bestId: string | null = null
  let bestDist = Infinity
  for (const [id, node] of Object.entries(graph.nodes)) {
    const dx = node.x - x
    const dy = node.y - y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      bestId = id
    }
  }
  return bestId
}

/** Find the walk graph node belonging to a specific room. */
export function roomNode(graph: WalkGraphData, roomId: string): string | null {
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.roomId === roomId) return id
  }
  return null
}

// ---------------------------------------------------------------------------
// AgentConfig
// ---------------------------------------------------------------------------

export interface AgentConfig {
  agentId: string
  spriteKey: string
  label: string
  homeRoomId: string
  startX: number
  startY: number
  facing: Direction
  tint?: number
  isSpecialist: boolean
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

export class Agent {
  sprite: Phaser.Physics.Arcade.Sprite
  agentId: string
  label: string
  status: SeatStatus = 'empty'
  workState: WorkState = 'idle'
  currentRoomId: string | null = null

  private scene: Phaser.Scene
  private spriteKey: string
  private config: AgentConfig
  private walkGraph: WalkGraphData
  private facing: Direction

  // Path following
  private path: PathStep[] = []
  private pathIdx = 0

  // Overlays
  private nameLabel: Phaser.GameObjects.Text | null = null
  private glowCircle: Phaser.GameObjects.Arc | null = null
  private glowTween: Phaser.Tweens.Tween | null = null
  private emoteSprite: Phaser.GameObjects.Sprite | null = null
  private bubbleText: Phaser.GameObjects.Text | null = null
  private bubbleBg: Phaser.GameObjects.Graphics | null = null
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null

  // Timers
  private wanderTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private taskReturnTimer: ReturnType<typeof setTimeout> | null = null
  private idleEmoteCycleTimer: ReturnType<typeof setInterval> | null = null

  // Mood system (Tier C)
  private mood: AgentMood = 'neutral'
  private baseTint: number | undefined
  private moodFrameCounter = 0
  private bouncePhase = 0

  constructor(scene: Phaser.Scene, config: AgentConfig, walkGraph: WalkGraphData) {
    this.scene = scene
    this.config = config
    this.walkGraph = walkGraph
    this.agentId = config.agentId
    this.label = config.label
    this.spriteKey = config.spriteKey
    this.facing = config.facing

    // Create animations for this sprite key
    const idleAnims = makeAnims(config.spriteKey, 'idle', 1, 8)
    const walkAnims = makeAnims(config.spriteKey, 'walk', 2, 10)
    for (const anim of [...idleAnims, ...walkAnims]) {
      if (scene.anims.exists(anim.key)) continue
      const frames: Phaser.Types.Animations.AnimationFrame[] = []
      for (let i = anim.start; i <= anim.end; i++) {
        frames.push({ key: config.spriteKey, frame: i })
      }
      scene.anims.create({
        key: anim.key,
        frames,
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      })
    }

    // Create physics sprite
    this.sprite = scene.physics.add.sprite(config.startX, config.startY, config.spriteKey, 0)
    this.sprite.setDepth(5)
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setSize(FRAME_WIDTH * BODY_SIZE_RATIO_W, FRAME_HEIGHT * BODY_SIZE_RATIO_H)
    body.setOffset(FRAME_WIDTH * BODY_OFFSET_RATIO_X, FRAME_HEIGHT * BODY_OFFSET_RATIO_Y)

    // Apply tint for specialists
    this.baseTint = config.tint
    if (config.tint !== undefined) {
      this.sprite.setTint(config.tint)
    }

    // Play initial idle animation
    this.sprite.anims.play(`${config.spriteKey}:idle-${config.facing}`)

    // Name label
    this.nameLabel = scene.add.text(config.startX, config.startY + FRAME_HEIGHT * 0.15, config.label, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0).setDepth(15)

    // Pulse glow circle (hidden by default)
    this.glowCircle = scene.add.circle(config.startX, config.startY + 20, 18, 0xffffff, 0)
    this.glowCircle.setDepth(1)

    // Track starting room
    this.currentRoomId = config.homeRoomId

    // Start wandering
    this.scheduleWander()
  }

  // ── Public API ──

  /** Cancel wander, show glow, navigate to target room, show emote on arrival. */
  assignTask(targetRoomId: string, taskSnippet?: string): void {
    this.status = 'running'
    this.cancelWander()
    this.cancelIdleTimeout()
    this.clearTaskReturnTimer()
    this.clearEmote()
    this.clearBubble()

    // Show assigned emote + pulsing glow
    this.showEmote('emote:device')
    this.showGlow()

    // Show task snippet bubble if provided
    if (taskSnippet) {
      this.showBubble(taskSnippet, 4000)
    }

    // Navigate to the target room
    this.currentRoomId = targetRoomId
    this.navigateToRoom(targetRoomId)
    this.updateMood()
  }

  /** Show done emote, return home after 4s delay. */
  completeTask(): void {
    this.status = 'done'
    this.hideGlow()
    this.clearEmote()
    this.showEmote('emote:star')
    this.showBubble('Done!', 3000)
    this.updateMood()

    this.clearTaskReturnTimer()
    this.taskReturnTimer = setTimeout(() => {
      this.status = 'empty'
      this.clearEmote()
      this.clearBubble()
      this.currentRoomId = this.config.homeRoomId
      this.navigateToRoom(this.config.homeRoomId)
      this.scheduleWander()
      this.scheduleIdleTimeout()
      this.updateMood()
    }, 4000)
  }

  /** Show fail emote, return home after 4s delay. */
  failTask(): void {
    this.status = 'failed'
    this.hideGlow()
    this.clearEmote()
    this.showEmote('emote:angry')
    this.showBubble('Failed...', 3000)
    this.updateMood()

    this.clearTaskReturnTimer()
    this.taskReturnTimer = setTimeout(() => {
      this.status = 'empty'
      this.clearEmote()
      this.clearBubble()
      this.currentRoomId = this.config.homeRoomId
      this.navigateToRoom(this.config.homeRoomId)
      this.scheduleWander()
      this.scheduleIdleTimeout()
      this.updateMood()
    }, 4000)
  }

  /** Update emote from WORK_STATE_EMOTES lookup. */
  setWorkState(state: WorkState): void {
    this.workState = state
    const emoteKey = WORK_STATE_EMOTES[state]
    if (emoteKey) {
      this.showEmote(emoteKey)
    } else {
      this.clearEmote()
    }
  }

  /** Called every frame: update overlay positions, follow path, mood. */
  update(): void {
    // Periodic mood update (every 60 frames ≈ 1s)
    this.moodFrameCounter++
    if (this.moodFrameCounter >= 60) {
      this.moodFrameCounter = 0
      this.updateMood()
    }

    // Happy bounce effect
    const moodVisuals = MOOD_VISUALS[this.mood]
    if (moodVisuals.bounceAmplitude > 0) {
      this.bouncePhase += 0.1
      const bounceY = Math.sin(this.bouncePhase) * moodVisuals.bounceAmplitude
      this.sprite.y += bounceY
    }

    // Keep overlays tracking sprite position
    if (this.emoteSprite) {
      this.emoteSprite.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET)
    }
    if (this.bubbleText) {
      this.bubbleText.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET)
      this.updateBubbleBg()
    }
    if (this.nameLabel) {
      this.nameLabel.setPosition(this.sprite.x, this.sprite.y + FRAME_HEIGHT * 0.15)
    }
    if (this.glowCircle) {
      this.glowCircle.setPosition(this.sprite.x, this.sprite.y + 20)
    }

    // No path to follow — idle
    if (this.path.length === 0 || this.pathIdx >= this.path.length) {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setVelocity(0, 0)
      const idleKey = `${this.spriteKey}:idle-${this.facing}`
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey)
      }
      return
    }

    // Follow path
    const target = this.path[this.pathIdx]
    const dx = target.x - this.sprite.x
    const dy = target.y - this.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < ARRIVE_THRESHOLD) {
      this.pathIdx++
      if (this.pathIdx >= this.path.length) {
        this.path = []
        return
      }
      return
    }

    const speed = MOVE_SPEED * WORKER_SPEED_FACTOR * moodVisuals.speedMultiplier
    const vx = (dx / dist) * speed
    const vy = (dy / dist) * speed
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(vx, vy)

    // Update facing direction based on dominant axis
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

  /** Show or hide sprite + all overlays (name label, glow, emote, bubble). */
  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible)
    if (this.nameLabel) this.nameLabel.setVisible(visible)
    if (this.glowCircle) this.glowCircle.setVisible(visible)
    if (this.emoteSprite) this.emoteSprite.setVisible(visible)
    if (this.bubbleText) this.bubbleText.setVisible(visible)
    if (this.bubbleBg) this.bubbleBg.setVisible(visible)
    if (!visible) {
      this.cancelWander()
      this.cancelIdleTimeout()
    }
  }

  /** Navigate to break-room when idle too long (scene-local, no FleetStore change). */
  migrateToBreakRoom(): void {
    if (this.status !== 'empty') return
    this.cancelWander()
    this.currentRoomId = 'break-room'
    this.navigateToRoom('break-room')
    this.startIdleEmoteCycle() // restart with break-room behavior
    this.updateMood()
  }

  // ── Mood system (Tier C) ──

  private updateMood(): void {
    if (this.currentRoomId === 'break-room' && this.status === 'empty') {
      this.setMood('sleeping')
    } else if (this.status === 'done') {
      this.setMood('happy')
    } else if (this.status === 'failed') {
      this.setMood('stressed')
    } else {
      this.setMood('neutral')
    }
  }

  private setMood(mood: AgentMood): void {
    if (this.mood === mood) return
    this.mood = mood
    const visuals = MOOD_VISUALS[mood]

    // Apply mood tint (preserve base tint for specialists)
    if (visuals.tintColor) {
      this.sprite.setTint(visuals.tintColor)
    } else if (this.baseTint !== undefined) {
      this.sprite.setTint(this.baseTint)
    } else {
      this.sprite.clearTint()
    }

    // Show mood emote only when idle (don't override task emotes)
    if (visuals.emote && this.workState === 'idle') {
      this.showEmote(visuals.emote)
    }
  }

  /** Cleanup all timers and game objects. */
  destroy(): void {
    this.cancelWander()
    this.cancelIdleTimeout()
    this.clearTaskReturnTimer()
    this.stopIdleEmoteCycle()
    this.clearEmote()
    this.clearBubble()
    this.hideGlow()
    if (this.nameLabel) { this.nameLabel.destroy(); this.nameLabel = null }
    if (this.glowCircle) { this.glowCircle.destroy(); this.glowCircle = null }
    if (this.bubbleBg) { this.bubbleBg.destroy(); this.bubbleBg = null }
    this.sprite.destroy()
  }

  // ── Private: navigation ──

  /** BFS path from current position to a room's walk graph node. */
  private navigateToRoom(roomId: string): void {
    const fromId = nearestNode(this.walkGraph, this.sprite.x, this.sprite.y)
    const toId = roomNode(this.walkGraph, roomId)
    if (!fromId || !toId) return

    const steps = bfsPath(this.walkGraph, fromId, toId)
    if (steps && steps.length > 1) {
      this.path = steps
      this.pathIdx = 1 // skip the node we're already at
    }
  }

  // ── Private: wandering ──

  private scheduleWander(): void {
    if (this.status === 'running') return
    this.cancelWander()

    const behavior = ROOM_BEHAVIORS[this.currentRoomId ?? ''] ?? DEFAULT_BEHAVIOR

    // Start room-specific idle emote cycling
    this.startIdleEmoteCycle()

    if (!behavior.wanderEnabled) return

    const delay = WANDER_MIN_DELAY + Math.random() * (WANDER_MAX_DELAY - WANDER_MIN_DELAY)
    this.wanderTimer = setTimeout(() => {
      if (this.status === 'running') return
      // Random offset scaled by room wander speed
      const scale = behavior.wanderSpeed
      const offsetX = (Math.random() - 0.5) * 60 * scale
      const offsetY = (Math.random() - 0.5) * 40 * scale
      const targetX = this.sprite.x + offsetX
      const targetY = this.sprite.y + offsetY
      this.path = [{ nodeId: '_wander', x: targetX, y: targetY }]
      this.pathIdx = 0
      this.scheduleWander()
    }, delay)
  }

  private cancelWander(): void {
    if (this.wanderTimer) {
      clearTimeout(this.wanderTimer)
      this.wanderTimer = null
    }
    this.stopIdleEmoteCycle()
  }

  private startIdleEmoteCycle(): void {
    this.stopIdleEmoteCycle()
    const behavior = ROOM_BEHAVIORS[this.currentRoomId ?? ''] ?? DEFAULT_BEHAVIOR
    if (behavior.idleEmotes.length === 0) return

    this.idleEmoteCycleTimer = setInterval(() => {
      if (this.status !== 'empty') return
      const emote = behavior.idleEmotes[Math.floor(Math.random() * behavior.idleEmotes.length)]
      this.showEmote(emote)
      // 30% chance to show an idle chat bubble
      if (behavior.idleBubbles.length > 0 && Math.random() < 0.3) {
        const bubble = behavior.idleBubbles[Math.floor(Math.random() * behavior.idleBubbles.length)]
        this.showBubble(bubble, 3000)
      }
    }, behavior.emoteCycleMs)
  }

  private stopIdleEmoteCycle(): void {
    if (this.idleEmoteCycleTimer) {
      clearInterval(this.idleEmoteCycleTimer)
      this.idleEmoteCycleTimer = null
    }
  }

  // ── Private: idle timeout ──

  private scheduleIdleTimeout(): void {
    this.cancelIdleTimeout()
    this.idleTimer = setTimeout(() => {
      if (this.status === 'empty') {
        this.migrateToBreakRoom()
      }
    }, IDLE_TIMEOUT_MS)
  }

  private cancelIdleTimeout(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  // ── Private: task return timer ──

  private clearTaskReturnTimer(): void {
    if (this.taskReturnTimer) {
      clearTimeout(this.taskReturnTimer)
      this.taskReturnTimer = null
    }
  }

  // ── Private: emote ──

  private showEmote(emoteKey: string): void {
    this.clearEmote()
    const frameIdx = EMOTE_FRAMES[emoteKey] ?? 0
    this.emoteSprite = this.scene.add.sprite(
      this.sprite.x,
      this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
      EMOTE_SHEET_KEY,
      frameIdx,
    )
    this.emoteSprite.setDepth(20).setScale(0.6)
  }

  private clearEmote(): void {
    if (this.emoteSprite) {
      this.emoteSprite.destroy()
      this.emoteSprite = null
    }
  }

  // ── Private: bubble ──

  showBubble(text: string, ttl = 5000): void {
    this.clearBubble()
    const truncated = text.length > 40 ? text.slice(0, 37) + '...' : text

    this.bubbleText = this.scene.add.text(
      this.sprite.x,
      this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET,
      truncated,
      {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#e2e8f0',
        padding: { x: 6, y: 4 },
        wordWrap: { width: 120 },
      },
    ).setOrigin(0.5, 1).setDepth(21)

    this.bubbleBg = this.scene.add.graphics().setDepth(20)
    this.updateBubbleBg()

    this.bubbleTimer = setTimeout(() => this.clearBubble(), ttl)
  }

  /** Whether a speech bubble is currently visible. */
  hasBubble(): boolean {
    return this.bubbleText !== null
  }

  private updateBubbleBg(): void {
    if (!this.bubbleBg || !this.bubbleText) return
    this.bubbleBg.clear()
    const b = this.bubbleText.getBounds()
    const pad = 4
    // Rounded background
    this.bubbleBg.fillStyle(0x0f172a, 0.92)
    this.bubbleBg.fillRoundedRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 4)
    // Pointer triangle
    const cx = b.x + b.width / 2
    const bottom = b.y + b.height + pad
    this.bubbleBg.fillTriangle(cx - 4, bottom, cx + 4, bottom, cx, bottom + 6)
  }

  private clearBubble(): void {
    if (this.bubbleTimer) { clearTimeout(this.bubbleTimer); this.bubbleTimer = null }
    if (this.bubbleBg) { this.bubbleBg.destroy(); this.bubbleBg = null }
    if (this.bubbleText) { this.bubbleText.destroy(); this.bubbleText = null }
  }

  // ── Private: glow ──

  private showGlow(): void {
    if (!this.glowCircle) return
    this.glowCircle.setAlpha(0.35)
    this.glowTween = this.scene.tweens.add({
      targets: this.glowCircle,
      alpha: { from: 0.35, to: 0.08 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private hideGlow(): void {
    if (this.glowTween) {
      this.glowTween.stop()
      this.glowTween = null
    }
    if (this.glowCircle) {
      this.glowCircle.setAlpha(0)
    }
  }
}
