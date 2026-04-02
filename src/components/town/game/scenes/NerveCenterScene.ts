/**
 * NerveCenterScene — pixel-art Phaser scene for the redesigned Nerve Center.
 *
 * Renders 10 rooms, spawns 13 agents (4 generalists + 9 specialists),
 * wires town/gateway events, and manages the camera.
 *
 * Rooms are drawn as colored rounded rectangles from a manifest JSON.
 * Agents use BFS pathfinding on the walk graph to navigate between rooms.
 * Specialist sprites start hidden and become visible when FleetStore reports
 * their status as non-empty.
 */

import * as Phaser from 'phaser'
import { Agent, type AgentConfig, type WalkGraphData, type RoomBoundsMap } from '../entities/Agent'
import { Player } from '../entities/Player'
import { FRAME_WIDTH, FRAME_HEIGHT, WORKER_SPRITES, SPECIALIST_SPRITES } from '../config/animations'
import { SPRITE_KEY, SPRITE_PATH } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE } from '../config/emotes'
import { buildSpriteFrames } from '../utils/MapHelpers'
import { translateRoomId, AGENT_HOME_ROOM } from './room-id-map'
import { townEvents, type SeatStatus } from '@/lib/town/events'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { getFleetStore } from '@/lib/town/fleet-store'
import { EVENT_TO_ROOM, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY, CAMERA_LERP, INTERACT_DISTANCE, PRESS_E_STYLE } from '@/lib/town/constants'
import type { TelemetryEvent } from '@/lib/gateway-view/types'
import { BotStateStore, type BotState } from '@/lib/town/bot-state-store'

// ---------------------------------------------------------------------------
// Manifest shape (nerve-center-map.logic.json v3)
// ---------------------------------------------------------------------------

interface ManifestSeat {
  id: string
  agentId: string
  x: number
  y: number
}

interface ManifestRoom {
  id: string
  label: string
  color: string
  bounds: [number, number, number, number]
  seats: ManifestSeat[]
}

interface ManifestMeta {
  version: string
  schema: string
  canvas: { width: number; height: number }
}

interface NerveCenterManifest {
  meta: ManifestMeta
  rooms: ManifestRoom[]
  walkGraph: WalkGraphData
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_URL = '/town/gateway/nerve-center-map.logic.json'
const TOOLTIP_TTL = 4000
const GENERALIST_IDS = ['gen-lifeforce', 'gen-industry', 'gen-fellowship', 'gen-essence']

// ---------------------------------------------------------------------------
// NerveCenterScene
// ---------------------------------------------------------------------------

export class NerveCenterScene extends Phaser.Scene {
  private manifest!: NerveCenterManifest
  private manifestJson: string | null = null
  private agents: Agent[] = []
  private agentMap = new Map<string, Agent>()

  private player!: Player
  private eKey: Phaser.Input.Keyboard.Key | null = null
  private interactionOpen = false
  private promptText: Phaser.GameObjects.Text | null = null

  // Drag state
  private dragAgent: Agent | null = null
  private dragGhost: Phaser.GameObjects.Graphics | null = null
  private isDragging = false
  private dragStartTime = 0

  private tooltip: Phaser.GameObjects.Text | null = null
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null
  private eventCleanups: Array<() => void> = []
  private botStore = new BotStateStore()
  private saveTimer: ReturnType<typeof setInterval> | null = null

  // Dynamic furniture (Tier C)
  private roomPapers = new Map<string, Phaser.GameObjects.Graphics>()
  private roomWarning = new Map<string, { gfx: Phaser.GameObjects.Graphics; tween: Phaser.Tweens.Tween }>()

  // Ambient overlay (Tier C)
  private ambientOverlay: Phaser.GameObjects.Graphics | null = null
  private ambientTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    super({ key: 'NerveCenterScene' })
  }

  // ── preload ──────────────────────────────────────────────────────────────

  preload(): void {
    // Generalist sprites
    for (const ws of WORKER_SPRITES) {
      this.load.image(ws.key, ws.path)
    }

    // Specialist sprites
    for (const ss of SPECIALIST_SPRITES) {
      this.load.image(ss.key, ss.sourcePath)
    }

    // Boss (player) sprite
    this.load.image(SPRITE_KEY, SPRITE_PATH)

    // Boss arrow indicator
    this.load.spritesheet('boss-arrow', '/town/sprites/arrow_down_48x48.png', { frameWidth: 48, frameHeight: 48 })

    // Emote spritesheet
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    })

    // Fetch manifest JSON (outside Phaser loader to avoid type mismatch)
    fetch(MANIFEST_URL)
      .then(r => r.text())
      .then(text => { this.manifestJson = text })
      .catch(err => { console.error('[NerveCenterScene] Failed to fetch manifest:', err) })
  }

  // ── create ───────────────────────────────────────────────────────────────

  create(): void {
    // 1. Parse manifest
    if (!this.manifestJson) {
      console.error('[NerveCenterScene] Manifest not loaded')
      gatewayEvents.emit('gateway-scene-error', 'Failed to load nerve-center manifest')
      return
    }

    try {
      this.manifest = JSON.parse(this.manifestJson) as NerveCenterManifest
    } catch (err) {
      console.error('[NerveCenterScene] Invalid manifest JSON:', err)
      gatewayEvents.emit('gateway-scene-error', 'Invalid nerve-center manifest JSON')
      return
    }

    // 2. Build sprite frames for each loaded character sheet
    for (const ws of WORKER_SPRITES) {
      buildSpriteFrames(this, ws.key)
    }
    for (const ss of SPECIALIST_SPRITES) {
      buildSpriteFrames(this, ss.key)
    }

    // 2b. Build boss sprite frames
    buildSpriteFrames(this, SPRITE_KEY)

    // 3. Render rooms and corridors
    this.renderRooms()
    this.renderCorridors()

    // 3b. Day/night ambient tinting (Tier C)
    this.ambientOverlay = this.add.graphics().setDepth(0.5)
    this.updateAmbientTint()
    this.ambientTimer = setInterval(() => this.updateAmbientTint(), 60000)

    // 4. Spawn agents
    this.spawnAgents()

    // 4a. Restore agent positions from BotStateStore
    this.restoreAgentPositions()

    // 4b. Start periodic position save (every 2s)
    this.saveTimer = setInterval(() => this.saveAgentPositions(), 2000)

    // 4c. Create player character at command-hub center
    const commandHub = this.manifest.rooms.find(r => r.id === 'command-hub')
    const playerX = commandHub ? commandHub.bounds[0] + commandHub.bounds[2] / 2 : 640
    const playerY = commandHub ? commandHub.bounds[1] + commandHub.bounds[3] / 2 : 400
    this.player = new Player(this, playerX, playerY, 'down')
    this.player.sprite.setDepth(10) // Above agents (depth 5)

    // E-key setup
    const kb = this.input.keyboard
    if (kb) {
      this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false)
    }

    // Interaction prompt text (hidden by default)
    this.promptText = this.add.text(0, 0, 'Press E', PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5, 1).setDepth(25).setVisible(false)

    // 5. Wire events
    this.wireEvents()

    // 6. Camera setup — auto-fit world into viewport, follow player
    const canvasW = this.manifest.meta.canvas.width
    const canvasH = this.manifest.meta.canvas.height

    const cam = this.cameras.main
    const fitZoom = Math.min(cam.width / canvasW, cam.height / canvasH)
    cam.setZoom(fitZoom)
    cam.setBounds(0, 0, canvasW, canvasH)
    this.physics.world.setBounds(0, 0, canvasW, canvasH)
    cam.startFollow(this.player.sprite, true, CAMERA_LERP, CAMERA_LERP)

    // Re-fit on resize
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      cam.setZoom(Math.min(gameSize.width / canvasW, gameSize.height / canvasH))
    })

    // Mouse wheel zoom
    this.input.on('wheel', (_pointer: unknown, _gos: unknown, _dx: number, _dy: number, dz: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dz * ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX))
    })

    // 7. Click + drag detection
    this.game.canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault())

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer.worldX, pointer.worldY)
        return
      }
      // Check if clicking on an agent for drag
      for (const agent of this.agents) {
        if (!agent.sprite.visible) continue
        const dx = Math.abs(pointer.worldX - agent.sprite.x)
        const dy = Math.abs(pointer.worldY - agent.sprite.y)
        if (dx < FRAME_WIDTH / 2 && dy < FRAME_HEIGHT / 2) {
          this.dragAgent = agent
          this.dragStartTime = Date.now()
          return
        }
      }
      // No agent hit — check rooms for tooltip
      this.handleRoomClick(pointer.worldX, pointer.worldY)
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragAgent && !this.isDragging && Date.now() - this.dragStartTime > 200) {
        // Start dragging after 200ms hold
        this.isDragging = true
        this.dragGhost = this.add.graphics()
        this.dragGhost.setDepth(50)
        this.dragGhost.fillStyle(0xffffff, 0.3)
        this.dragGhost.fillCircle(0, 0, 16)
        this.dragGhost.lineStyle(2, 0xffd700, 0.8)
        this.dragGhost.strokeCircle(0, 0, 16)
      }
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging && this.dragAgent) {
        this.handleDrop(pointer.worldX, pointer.worldY)
      } else if (this.dragAgent) {
        // Short click on agent — show tooltip
        const agent = this.dragAgent
        const store = getFleetStore()
        const fleetAgent = store.getSnapshot().agents.find(a => a.id === agent.agentId)
        const taskLine = fleetAgent?.currentTask ? `\nTask: ${fleetAgent.currentTask}` : ''
        this.showTooltip(agent.sprite.x, agent.sprite.y - FRAME_HEIGHT / 2 - 10,
          `${agent.label} (${agent.agentId})\nStatus: ${agent.status} | State: ${agent.workState}${taskLine}`)
        townEvents.emit('open-terminal', agent.agentId)
      }
      this.dragAgent = null
      this.isDragging = false
      if (this.dragGhost) { this.dragGhost.destroy(); this.dragGhost = null }
    })

    // 8. Signal ready
    gatewayEvents.emit('gateway-scene-ready')

    // 9. Cleanup on shutdown/destroy
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.shutdown())
  }

  // ── update ───────────────────────────────────────────────────────────────

  update(): void {
    // Player movement
    if (!this.interactionOpen && !this.isDragging) {
      this.player.update()
    }

    // Update agents
    for (const agent of this.agents) {
      agent.update()
    }

    // E-key proximity check
    this.checkProximity()

    // Drag update
    if (this.isDragging && this.dragGhost) {
      const pointer = this.input.activePointer
      this.dragGhost.setPosition(pointer.worldX, pointer.worldY)
    }
  }

  // ── renderRooms ──────────────────────────────────────────────────────────

  private renderRooms(): void {
    // Background
    const canvasW = this.manifest.meta.canvas.width
    const canvasH = this.manifest.meta.canvas.height
    const bg = this.add.graphics()
    bg.fillStyle(0x0e1117, 1)
    bg.fillRect(0, 0, canvasW, canvasH)
    bg.setDepth(0)

    for (const room of this.manifest.rooms) {
      const [x, y, w, h] = room.bounds
      const colorHex = parseInt(room.color.replace('#', ''), 16)
      const gfx = this.add.graphics()

      // Fill
      gfx.fillStyle(colorHex, 0.15)
      gfx.fillRoundedRect(x, y, w, h, 12)

      // Stroke
      gfx.lineStyle(2, colorHex, 0.6)
      gfx.strokeRoundedRect(x, y, w, h, 12)

      gfx.setDepth(1)

      // Label
      this.add.text(x + w / 2, y + 16, room.label, {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: room.color,
      }).setOrigin(0.5, 0.5).setDepth(2)
    }
  }

  // ── renderCorridors ──────────────────────────────────────────────────────

  private renderCorridors(): void {
    const nodes = this.manifest.walkGraph.nodes
    const edges = this.manifest.walkGraph.edges
    const gfx = this.add.graphics()
    gfx.setDepth(0.5)

    for (const [aId, bId] of edges) {
      const nodeA = nodes[aId]
      const nodeB = nodes[bId]
      if (!nodeA || !nodeB) continue

      // Only draw corridors between nodes that are NOT in the same room
      const roomA = nodeA.roomId ?? null
      const roomB = nodeB.roomId ?? null
      if (roomA && roomB && roomA === roomB) continue

      // Very subtle dotted path — barely visible
      gfx.lineStyle(1, 0x2a2f3a, 0.25)
      gfx.lineBetween(nodeA.x, nodeA.y, nodeB.x, nodeB.y)
    }
  }

  // ── spawnAgents ──────────────────────────────────────────────────────────

  private spawnAgents(): void {
    // Build seat lookup: agentId → {x, y}
    const seatLookup = new Map<string, { x: number; y: number }>()
    // Build room bounds lookup for wander clamping
    const roomBoundsMap = new Map<string, [number, number, number, number]>()
    for (const room of this.manifest.rooms) {
      roomBoundsMap.set(room.id, room.bounds)
      for (const seat of room.seats) {
        seatLookup.set(seat.agentId, { x: seat.x, y: seat.y })
      }
    }

    // Spawn 4 generalists
    for (let i = 0; i < GENERALIST_IDS.length; i++) {
      const agentId = GENERALIST_IDS[i]
      const spriteConfig = WORKER_SPRITES[i]
      if (!spriteConfig) continue

      const pos = seatLookup.get(agentId) ?? { x: 640, y: 360 }
      const homeRoom = AGENT_HOME_ROOM[agentId] ?? 'command-hub'

      const config: AgentConfig = {
        agentId,
        spriteKey: spriteConfig.key,
        label: spriteConfig.label,
        homeRoomId: homeRoom,
        startX: pos.x,
        startY: pos.y,
        facing: 'down',
        isSpecialist: false,
      }

      const agent = new Agent(this, config, this.manifest.walkGraph, roomBoundsMap)
      this.agents.push(agent)
      this.agentMap.set(agentId, agent)
    }

    // Spawn 9 specialists (SPECIALIST_SPRITES includes engineering)
    for (const ss of SPECIALIST_SPRITES) {
      const pos = seatLookup.get(ss.agentId) ?? { x: 640, y: 360 }
      const homeRoom = AGENT_HOME_ROOM[ss.agentId] ?? 'command-hub'

      const config: AgentConfig = {
        agentId: ss.agentId,
        spriteKey: ss.key,
        label: ss.label,
        homeRoomId: homeRoom,
        startX: pos.x,
        startY: pos.y,
        facing: 'down',
        tint: ss.tint,
        isSpecialist: true,
      }

      const agent = new Agent(this, config, this.manifest.walkGraph, roomBoundsMap)

      // Specialists start hidden — shown when FleetStore reports active
      agent.setVisible(false)

      this.agents.push(agent)
      this.agentMap.set(ss.agentId, agent)
    }

    console.log(`[NerveCenterScene] Spawned ${this.agents.length} agents (${GENERALIST_IDS.length} generalists, ${SPECIALIST_SPRITES.length} specialists)`)
  }

  // ── wireEvents ───────────────────────────────────────────────────────────

  private wireEvents(): void {
    // Task lifecycle
    this.eventCleanups.push(
      townEvents.on('task-assigned', (seatId: string, message: string) => {
        const agent = this.resolveAgent(seatId)
        if (!agent) return
        const homeRoom = AGENT_HOME_ROOM[agent.agentId]
        agent.assignTask(homeRoom ?? 'command-hub', message)
        this.updateRoomWorkload()
      }),
    )

    this.eventCleanups.push(
      townEvents.on('task-completed', (seatId: string) => {
        const agent = this.resolveAgent(seatId)
        if (!agent) return
        agent.completeTask()
        this.updateRoomWorkload()
      }),
    )

    this.eventCleanups.push(
      townEvents.on('task-failed', (seatId: string) => {
        const agent = this.resolveAgent(seatId)
        if (!agent) return
        agent.failTask()
        this.updateRoomWorkload()
      }),
    )

    // Agent status updates
    this.eventCleanups.push(
      townEvents.on('agent-status', (seatId: string, status: SeatStatus) => {
        const agent = this.resolveAgent(seatId)
        if (agent) agent.status = status
      }),
    )

    // Telemetry routing
    this.eventCleanups.push(
      gatewayEvents.on('telemetry-event', (event: TelemetryEvent) => {
        const oldRoomId = EVENT_TO_ROOM[event.type]
        if (!oldRoomId) return

        const newRoomId = translateRoomId(oldRoomId)
        const workState = EVENT_TO_WORK_STATE[event.type]

        // Find an agent in (or assigned to) that room, or pick the first idle generalist
        let agent = this.findAgentForRoom(newRoomId)
        if (!agent) {
          agent = this.agents.find(a => !a.sprite.visible ? false : a.workState === 'idle') ?? null
        }
        if (!agent) return

        agent.assignTask(newRoomId)
        if (workState) {
          agent.setWorkState(workState)
        }
      }),
    )

    // FleetStore subscription — sync specialist visibility + task bubbles
    const store = getFleetStore()
    const unsubStore = store.subscribe(() => {
      const snapshot = store.getSnapshot()
      for (const fleetAgent of snapshot.agents) {
        const agent = this.agentMap.get(fleetAgent.id)
        if (!agent) continue

        // Only toggle visibility for specialists
        const ss = SPECIALIST_SPRITES.find(s => s.agentId === fleetAgent.id)
        if (ss) {
          agent.setVisible(fleetAgent.status !== 'empty')
        }

        // Show current task text as speech bubble (Tier C)
        if (fleetAgent.currentTask && agent.sprite.visible && !agent.hasBubble()) {
          agent.showBubble(fleetAgent.currentTask)
        }
      }
      // Update dynamic furniture for server-side state changes (Tier C)
      this.updateRoomWorkload()
    })
    this.eventCleanups.push(unsubStore)

    // Terminal closed
    this.eventCleanups.push(
      townEvents.on('terminal-closed', () => {
        this.interactionOpen = false
      }),
    )
  }

  // ── resolveAgent ─────────────────────────────────────────────────────────

  private resolveAgent(seatId: string): Agent | null {
    // Direct match on agentId
    const direct = this.agentMap.get(seatId)
    if (direct) return direct

    // Parse seat-N → generalist ID
    const match = seatId.match(/^seat-(\d+)$/)
    if (match) {
      const idx = parseInt(match[1], 10)
      const genId = GENERALIST_IDS[idx]
      if (genId) return this.agentMap.get(genId) ?? null
    }

    return null
  }

  // ── findAgentForRoom ─────────────────────────────────────────────────────

  private findAgentForRoom(roomId: string): Agent | null {
    // Find an agent whose home room matches
    for (const agent of this.agents) {
      if (!agent.sprite.visible) continue
      const home = AGENT_HOME_ROOM[agent.agentId]
      if (home === roomId) return agent
    }
    return null
  }

  // ── checkProximity ──────────────────────────────────────────────────────

  private checkProximity(): void {
    if (this.interactionOpen) return

    let nearest: Agent | null = null
    let nearestDist = Infinity

    for (const agent of this.agents) {
      if (!agent.sprite.visible) continue
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x, this.player.sprite.y,
        agent.sprite.x, agent.sprite.y,
      )
      if (dist < INTERACT_DISTANCE && dist < nearestDist) {
        nearest = agent
        nearestDist = dist
      }
    }

    if (nearest) {
      this.promptText?.setPosition(nearest.sprite.x, nearest.sprite.y - FRAME_HEIGHT * 0.6)
      this.promptText?.setVisible(true)

      if (this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.interactionOpen = true
        this.promptText?.setVisible(false)
        townEvents.emit('open-terminal', nearest.agentId)
      }
    } else {
      this.promptText?.setVisible(false)
    }
  }

  // ── handleDrop ────────────────────────────────────────────────────────

  private handleDrop(worldX: number, worldY: number): void {
    if (!this.dragAgent) return
    // Find which room was dropped on
    for (const room of this.manifest.rooms) {
      const [rx, ry, rw, rh] = room.bounds
      if (worldX >= rx && worldX <= rx + rw && worldY >= ry && worldY <= ry + rh) {
        // Reassign agent to this room
        const agent = this.dragAgent
        agent.assignTask(room.id)
        AGENT_HOME_ROOM[agent.agentId] = room.id
        this.showTooltip(worldX, worldY - 20, `${agent.label} → ${room.label}`)
        return
      }
    }
    // Dropped outside any room — cancel
    this.showTooltip(worldX, worldY - 20, 'Drop cancelled')
  }

  // ── handleRoomClick ───────────────────────────────────────────────────

  private handleRoomClick(worldX: number, worldY: number): void {
    for (const room of this.manifest.rooms) {
      const [rx, ry, rw, rh] = room.bounds
      if (worldX >= rx && worldX <= rx + rw && worldY >= ry && worldY <= ry + rh) {
        const roomAgents = this.agents.filter(a => a.sprite.visible && a.currentRoomId === room.id)
        const agentLine = roomAgents.length > 0
          ? `\nAgents: ${roomAgents.map(a => a.label).join(', ')}`
          : '\nAgents: none'
        gatewayEvents.emit('room-clicked', room.id)
        this.showTooltip(rx + rw / 2, ry - 10, `${room.label}${agentLine}`)
        return
      }
    }
  }

  // ── handleRightClick ──────────────────────────────────────────────────

  private handleRightClick(worldX: number, worldY: number): void {
    // Emit right-click event for React context menu
    for (const room of this.manifest.rooms) {
      const [rx, ry, rw, rh] = room.bounds
      if (worldX >= rx && worldX <= rx + rw && worldY >= ry && worldY <= ry + rh) {
        gatewayEvents.emit('room-context-menu', room.id, worldX, worldY)
        return
      }
    }
  }

  // ── updateAmbientTint (Tier C — day/night) ──────────────────────────────

  private updateAmbientTint(): void {
    if (!this.ambientOverlay) return
    const hour = new Date().getHours()
    let color: number
    let alpha: number

    if (hour >= 6 && hour < 10) {
      color = 0xffd700; alpha = 0.04  // morning gold
    } else if (hour >= 10 && hour < 16) {
      color = 0xffffff; alpha = 0     // midday — no tint
    } else if (hour >= 16 && hour < 20) {
      color = 0xff8c00; alpha = 0.05  // evening amber
    } else {
      color = 0x4466aa; alpha = 0.08  // night blue
    }

    this.ambientOverlay.clear()
    if (alpha > 0) {
      const { width, height } = this.manifest.meta.canvas
      this.ambientOverlay.fillStyle(color, alpha)
      this.ambientOverlay.fillRect(0, 0, width, height)
    }
  }

  // ── updateRoomWorkload (Tier C — dynamic furniture) ─────────────────────

  private updateRoomWorkload(): void {
    for (const room of this.manifest.rooms) {
      if (room.seats.length === 0) continue

      const activeCount = this.agents.filter(
        a => a.sprite.visible && a.currentRoomId === room.id && a.status === 'running',
      ).length

      const colorHex = parseInt(room.color.replace('#', ''), 16)
      const [rx, ry, rw, rh] = room.bounds

      // Paper stacks for busy rooms (2+ active)
      if (activeCount >= 2 && !this.roomPapers.has(room.id)) {
        const papers = this.add.graphics().setDepth(3)
        for (const seat of room.seats) {
          // Small paper rectangles on desk
          papers.fillStyle(0xf5f5dc, 0.5)
          papers.fillRect(seat.x - 6, seat.y + 20, 8, 5)
          papers.fillRect(seat.x + 2, seat.y + 18, 7, 6)
        }
        this.roomPapers.set(room.id, papers)
      } else if (activeCount < 2 && this.roomPapers.has(room.id)) {
        this.roomPapers.get(room.id)!.destroy()
        this.roomPapers.delete(room.id)
      }

      // Signal overload to agents in this room (Tier C mood system)
      const overloaded = activeCount >= 5
      for (const agent of this.agents) {
        if (agent.currentRoomId === room.id) agent.roomOverloaded = overloaded
      }

      // Red warning glow for overloaded rooms (5+ active)
      if (overloaded && !this.roomWarning.has(room.id)) {
        const gfx = this.add.graphics().setDepth(0.8)
        gfx.lineStyle(3, 0xff3333, 0.6)
        gfx.strokeRoundedRect(rx - 2, ry - 2, rw + 4, rh + 4, 14)
        const tween = this.tweens.add({
          targets: gfx,
          alpha: { from: 0.6, to: 0.15 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
        this.roomWarning.set(room.id, { gfx, tween })
      } else if (!overloaded && this.roomWarning.has(room.id)) {
        const w = this.roomWarning.get(room.id)!
        w.tween.stop()
        w.gfx.destroy()
        this.roomWarning.delete(room.id)
      }
    }
  }

  // ── showTooltip ──────────────────────────────────────────────────────────

  private showTooltip(x: number, y: number, text: string): void {
    this.clearTooltip()

    this.tooltip = this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e2e8f0',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      padding: { x: 8, y: 5 },
    }).setOrigin(0.5, 1).setDepth(30)

    this.tooltipTimer = setTimeout(() => this.clearTooltip(), TOOLTIP_TTL)
  }

  private clearTooltip(): void {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer)
      this.tooltipTimer = null
    }
    if (this.tooltip) {
      this.tooltip.destroy()
      this.tooltip = null
    }
  }

  // ── shutdown ─────────────────────────────────────────────────────────────

  // ── BotStateStore persistence ──

  private restoreAgentPositions(): void {
    const saved = this.botStore.load()
    if (saved.length === 0) return

    const lookup = new Map(saved.map(s => [s.seatId, s]))
    for (const agent of this.agents) {
      const state = lookup.get(agent.agentId)
      if (!state) continue
      agent.sprite.setPosition(state.x, state.y)
      if (state.currentRoomId) agent.currentRoomId = state.currentRoomId
      if (state.status && state.status !== 'empty') agent.status = state.status
      if (state.workState && state.workState !== 'idle') agent.setWorkState(state.workState)
    }
    console.log(`[NerveCenterScene] Restored ${lookup.size} agent positions from BotStateStore`)
  }

  private saveAgentPositions(): void {
    const states: BotState[] = this.agents
      .filter(a => a.sprite.visible)
      .map(a => ({
        seatId: a.agentId,
        x: a.sprite.x,
        y: a.sprite.y,
        facing: 'down' as const,
        status: a.status,
        currentRoomId: a.currentRoomId,
        path: [],
        pathIdx: 0,
        workState: a.workState,
        lastEventId: null,
      }))
    this.botStore.save(states)
  }

  // ── shutdown ─────────────────────────────────────────────────────────────

  private shutdown(): void {
    // Save final positions before cleanup
    this.saveAgentPositions()
    if (this.saveTimer) { clearInterval(this.saveTimer); this.saveTimer = null }
    if (this.ambientTimer) { clearInterval(this.ambientTimer); this.ambientTimer = null }

    for (const cleanup of this.eventCleanups) cleanup()
    this.eventCleanups = []
    for (const agent of this.agents) agent.destroy()
    this.agents = []
    this.agentMap.clear()
    this.clearTooltip()
    if (this.promptText) { this.promptText.destroy(); this.promptText = null }
    if (this.dragGhost) { this.dragGhost.destroy(); this.dragGhost = null }
    if (this.ambientOverlay) { this.ambientOverlay.destroy(); this.ambientOverlay = null }

    // Clean up dynamic furniture
    for (const gfx of this.roomPapers.values()) gfx.destroy()
    this.roomPapers.clear()
    for (const { gfx, tween } of this.roomWarning.values()) { tween.stop(); gfx.destroy() }
    this.roomWarning.clear()
  }
}
